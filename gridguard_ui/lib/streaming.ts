// lib/streaming.ts — Real-time SSE streaming from backend

import { PipelineResult } from '@/lib/api';

const BASE_URL = (process.env.NEXT_PUBLIC_API_URL || 'https://unadmonitory-ungauntleted-kiesha.ngrok-free.dev').replace(/\/$/, '');

export interface StreamEvent {
  event_id: string;
  timestamp: string;
  raw_data?: Record<string, any>;
  pipeline_result?: PipelineResult;
  prediction?: PipelineResult;
}

export type StreamCallback = (event: StreamEvent) => void;
export type ErrorCallback = (error: Error) => void;

/**
 * Manages SSE connection to the backend streaming endpoint
 */
export class StreamManager {
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private callbacks: Set<StreamCallback> = new Set();
  private errorCallbacks: Set<ErrorCallback> = new Set();
  private isConnected = false;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 2000;
  private heartbeatTimeout: NodeJS.Timeout | null = null;

  /**
   * Connect to the streaming endpoint
   */
  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        if (this.reader) {
          this.disconnect();
        }

        const streamUrl = `${BASE_URL}/stream/events`;
        console.log(`[StreamManager] Connecting to ${streamUrl} via fetch`);

        fetch(streamUrl, {
          headers: {
            'ngrok-skip-browser-warning': '1',
            'Accept': 'text/event-stream',
            'Cache-Control': 'no-cache',
          }
        }).then(async (response) => {
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
          }
          if (!response.body) {
            throw new Error('No response body');
          }

          console.log('[StreamManager] Connected to streaming endpoint');
          this.isConnected = true;
          this.reconnectAttempts = 0;
          this.resetHeartbeatTimeout();
          resolve();

          this.reader = response.body.getReader();
          const decoder = new TextDecoder();
          let buffer = '';

          try {
            while (true) {
              const { done, value } = await this.reader.read();
              if (done) {
                console.log('[StreamManager] Stream closed by server');
                this.handleConnectionLoss();
                break;
              }

              buffer += decoder.decode(value, { stream: true });
              const parts = buffer.split('\n\n');
              buffer = parts.pop() || '';

              for (const part of parts) {
                const lines = part.split('\n');
                let eventType = 'message';
                let data = '';

                for (const line of lines) {
                  if (line.startsWith('event:')) {
                    eventType = line.slice(6).trim();
                  } else if (line.startsWith('data:')) {
                    data = line.slice(5).trim();
                  }
                }

                if (eventType === 'heartbeat' || data === '{}') {
                  console.log('[StreamManager] Heartbeat received');
                  this.resetHeartbeatTimeout();
                  continue;
                }

                if (data) {
                  try {
                    const parsed = JSON.parse(data) as StreamEvent & { prediction?: PipelineResult; pipeline_result?: PipelineResult };
                    const eventData: StreamEvent = {
                      ...parsed,
                      pipeline_result: parsed.pipeline_result ?? parsed.prediction,
                    };
                    this.reconnectAttempts = 0;
                    this.resetHeartbeatTimeout();
                    this.notifyCallbacks(eventData);
                  } catch (err) {
                    console.error('[StreamManager] Failed to parse event data:', err);
                  }
                }
              }
            }
          } catch (err) {
            if (this.isConnected) {
              console.error('[StreamManager] Reader error:', err);
              this.handleConnectionLoss();
            }
          }
        }).catch((err) => {
          const error = new Error(`Failed to connect to streaming: ${err}`);
          this.notifyErrors(error);
          reject(error);
        });

      } catch (err) {
        const error = new Error(`Failed to initialize stream: ${err}`);
        this.notifyErrors(error);
        reject(error);
      }
    });
  }

  /**
   * Disconnect from the streaming endpoint
   */
  disconnect(): void {
    if (this.reader) {
      this.reader.cancel().catch(() => {});
      this.reader = null;
    }
    this.isConnected = false;
    this.clearHeartbeatTimeout();
    console.log('[StreamManager] Disconnected');
  }

  /**
   * Subscribe to stream events
   */
  subscribe(callback: StreamCallback): () => void {
    this.callbacks.add(callback);
    console.log(`[StreamManager] Subscriber added (total: ${this.callbacks.size})`);

    // Return unsubscribe function
    return () => {
      this.callbacks.delete(callback);
      console.log(`[StreamManager] Subscriber removed (total: ${this.callbacks.size})`);
    };
  }

  /**
   * Subscribe to errors
   */
  onError(callback: ErrorCallback): () => void {
    this.errorCallbacks.add(callback);
    return () => {
      this.errorCallbacks.delete(callback);
    };
  }

  /**
   * Check if connected
   */
  isReady(): boolean {
    return this.isConnected && this.reader !== null;
  }

  /**
   * Notify all subscribers of new event
   */
  private notifyCallbacks(event: StreamEvent): void {
    this.callbacks.forEach(callback => {
      try {
        callback(event);
      } catch (err) {
        console.error('[StreamManager] Callback error:', err);
      }
    });
  }

  /**
   * Notify all error subscribers
   */
  private notifyErrors(error: Error): void {
    this.errorCallbacks.forEach(callback => {
      try {
        callback(error);
      } catch (err) {
        console.error('[StreamManager] Error callback error:', err);
      }
    });
  }

  /**
   * Handle connection loss with exponential backoff retry
   */
  private handleConnectionLoss(): void {
    this.isConnected = false;
    this.clearHeartbeatTimeout();

    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts);
      console.log(`[StreamManager] Attempting reconnect in ${delay}ms (attempt ${this.reconnectAttempts + 1}/${this.maxReconnectAttempts})`);

      setTimeout(() => {
        this.connect().catch(err => {
          console.error('[StreamManager] Reconnect failed:', err);
          this.reconnectAttempts++;
        });
      }, delay);
    } else {
      const error = new Error('Max reconnection attempts reached');
      this.notifyErrors(error);
      console.error('[StreamManager] Max reconnection attempts exceeded');
    }
  }

  /**
   * Heartbeat timeout to detect stale connections
   */
  private resetHeartbeatTimeout(): void {
    this.clearHeartbeatTimeout();
    this.heartbeatTimeout = setTimeout(() => {
      console.warn('[StreamManager] Heartbeat timeout - connection may be stale');
      this.disconnect();
      this.handleConnectionLoss();
    }, 45000); // 45 second timeout (ngrok needs more room)
  }

  /**
   * Clear heartbeat timeout
   */
  private clearHeartbeatTimeout(): void {
    if (this.heartbeatTimeout) {
      clearTimeout(this.heartbeatTimeout);
      this.heartbeatTimeout = null;
    }
  }
}

// Singleton instance
export const streamManager = new StreamManager();

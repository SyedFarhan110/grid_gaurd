// lib/streaming.ts — Real-time SSE streaming from backend

import { PipelineResult } from '@/lib/api';

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'https://unadmonitory-ungauntleted-kiesha.ngrok-free.dev';

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
  private eventSource: EventSource | null = null;
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
        if (this.eventSource) {
          this.disconnect();
        }

        const streamUrl = `${BASE_URL}/stream/events?ngrok-skip-browser-warning=1`;
        console.log(`[StreamManager] Connecting to ${streamUrl}`);

        this.eventSource = new EventSource(streamUrl);

        // Handle incoming stream events (supports both named events and default SSE messages)
        const handleStreamMessage = (event: MessageEvent) => {
          try {
            const parsed = JSON.parse(event.data) as StreamEvent & { prediction?: PipelineResult; pipeline_result?: PipelineResult };
            const data: StreamEvent = {
              ...parsed,
              pipeline_result: parsed.pipeline_result ?? parsed.prediction,
            };
            this.reconnectAttempts = 0; // Reset attempts on successful event
            this.resetHeartbeatTimeout();
            this.notifyCallbacks(data);
          } catch (err) {
            const error = new Error(`Failed to parse stream event: ${err}`);
            this.notifyErrors(error);
          }
        };

        this.eventSource.addEventListener('stream_event', handleStreamMessage);
        this.eventSource.onmessage = handleStreamMessage;

        // Handle heartbeat/keepalive if the backend emits it
        this.eventSource.addEventListener('heartbeat', () => {
          console.log('[StreamManager] Heartbeat received');
          this.resetHeartbeatTimeout();
        });

        this.eventSource.addEventListener('open', () => {
          console.log('[StreamManager] Connected to streaming endpoint');
          this.isConnected = true;
          this.reconnectAttempts = 0;
          this.resetHeartbeatTimeout();
          resolve();
        });

        this.eventSource.addEventListener('error', () => {
          if (this.eventSource?.readyState === EventSource.CLOSED) {
            console.log('[StreamManager] Connection closed');
            this.handleConnectionLoss();
          } else if (this.eventSource?.readyState === EventSource.CONNECTING) {
            console.warn('[StreamManager] Reconnecting...');
          }
        });

      } catch (err) {
        const error = new Error(`Failed to connect to streaming: ${err}`);
        this.notifyErrors(error);
        reject(error);
      }
    });
  }

  /**
   * Disconnect from the streaming endpoint
   */
  disconnect(): void {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
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
    return this.isConnected && this.eventSource?.readyState === EventSource.OPEN;
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
      if (this.eventSource) {
        this.disconnect();
        this.handleConnectionLoss();
      }
    }, 15000); // 15 second timeout
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

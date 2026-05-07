// lib/useStreaming.ts
'use client';
import { useCallback, useEffect, useRef } from 'react';
import { useApp } from '@/lib/store';
import { streamManager, StreamEvent } from '@/lib/streaming';

/**
 * Custom hook for accessing streaming functionality
 * Provides convenient access to streaming state and utilities
 */
export function useStreaming() {
  const { state, dispatch } = useApp();
  const callbacksRef = useRef<Set<(event: StreamEvent) => void>>(new Set());

  const isConnected = state.streamConnected;
  const hasError = !!state.streamError;
  const error = state.streamError;
  const latestResult = state.latestResult;
  const isFault = state.faultState === 'alert';
  const lastUpdate = state.lastPollTime;
  const liveReadings = state.liveReadings;

  /**
   * Subscribe to stream events in addition to state updates
   */
  const addStreamListener = useCallback((callback: (event: StreamEvent) => void) => {
    callbacksRef.current.add(callback);
    return () => callbacksRef.current.delete(callback);
  }, []);

  /**
   * Manually trigger reconnection attempt
   */
  const reconnect = useCallback(async () => {
    try {
      dispatch({ type: 'SET_STREAM_ERROR', payload: null });
      await streamManager.connect();
      dispatch({ type: 'SET_STREAM_CONNECTED', payload: true });
    } catch (err: any) {
      dispatch({ type: 'SET_STREAM_ERROR', payload: err.message });
    }
  }, [dispatch]);

  /**
   * Manually disconnect
   */
  const disconnect = useCallback(() => {
    streamManager.disconnect();
    dispatch({ type: 'SET_STREAM_CONNECTED', payload: false });
  }, [dispatch]);

  /**
   * Get latest fault probability
   */
  const getFaultProbability = useCallback(() => {
    return latestResult?.pipeline.fault_probability ?? 0;
  }, [latestResult]);

  /**
   * Get latest risk level
   */
  const getRiskLevel = useCallback(() => {
    return latestResult?.pipeline.risk_level ?? 'LOW';
  }, [latestResult]);

  /**
   * Get fault type if available
   */
  const getFaultType = useCallback(() => {
    return latestResult?.classification?.fault_type_label ?? null;
  }, [latestResult]);

  /**
   * Get fault location if available
   */
  const getFaultLocation = useCallback(() => {
    return latestResult?.localization?.substation_name ?? null;
  }, [latestResult]);

  /**
   * Get estimated recovery time if available
   */
  const getRecoveryEstimate = useCallback(() => {
    return latestResult?.etr?.estimated_recovery ?? null;
  }, [latestResult]);

  /**
   * Get latest reading (voltage, current, etc.)
   */
  const getLatestReading = useCallback(() => {
    return liveReadings[liveReadings.length - 1] ?? null;
  }, [liveReadings]);

  /**
   * Get reading history (last N readings)
   */
  const getReadingHistory = useCallback((count: number = 20) => {
    return liveReadings.slice(-count);
  }, [liveReadings]);

  /**
   * Check if connection is healthy
   */
  const isHealthy = useCallback(() => {
    return isConnected && !hasError;
  }, [isConnected, hasError]);

  /**
   * Format timestamp
   */
  const formatTimestamp = useCallback((timestamp: string): string => {
    return new Date(timestamp).toLocaleTimeString('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  }, []);

  return {
    // Connection state
    isConnected,
    hasError,
    error,
    isHealthy: isHealthy(),

    // Latest data
    latestResult,
    isFault,
    lastUpdate,
    liveReadings,

    // Getters
    getFaultProbability: getFaultProbability(),
    getRiskLevel: getRiskLevel(),
    getFaultType: getFaultType(),
    getFaultLocation: getFaultLocation(),
    getRecoveryEstimate: getRecoveryEstimate(),
    getLatestReading: getLatestReading(),
    getReadingHistory,

    // Actions
    addStreamListener,
    reconnect,
    disconnect,
    formatTimestamp,
  };
}

export default useStreaming;

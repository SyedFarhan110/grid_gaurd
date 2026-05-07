// components/StreamingStatus.tsx
'use client';
import { useApp } from '@/lib/store';
import { Wifi, WifiOff, AlertCircle } from 'lucide-react';

export default function StreamingStatus() {
  const { state } = useApp();

  if (!state.streamConnected && !state.streamError) {
    return null; // Don't show if not connected but no error
  }

  const isConnected = state.streamConnected;
  const hasError = !!state.streamError;

  const bgColor = hasError ? 'var(--alert-dim)' : isConnected ? 'var(--success-dim)' : 'var(--warn-dim)';
  const borderColor = hasError ? 'var(--alert-500)' : isConnected ? 'var(--normal-500)' : 'var(--warn-500)';
  const textColor = hasError ? 'var(--alert-500)' : isConnected ? 'var(--normal-500)' : 'var(--warn-500)';
  const Icon = hasError ? AlertCircle : isConnected ? Wifi : WifiOff;

  const message = hasError
    ? `Stream Error: ${state.streamError}`
    : isConnected
    ? 'Streaming: Connected'
    : 'Streaming: Connecting...';

  return (
    <div
      style={{
        background: bgColor,
        border: `1px solid ${borderColor}`,
        borderRadius: 6,
        padding: '8px 12px',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        fontSize: 11,
        fontFamily: 'var(--font-mono)',
        color: textColor,
      }}
    >
      <Icon size={14} style={{ color: textColor }} />
      <span>{message}</span>
    </div>
  );
}

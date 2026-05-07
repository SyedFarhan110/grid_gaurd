'use client';
import { useState, useEffect } from 'react';
import { useApp } from '@/lib/store';
import { RefreshCw, Cpu, Wifi, WifiOff } from 'lucide-react';
import StreamingStatus from './StreamingStatus';

export default function Header() {
  const { state, runPipeline, triggerFaultDemo, triggerNormalDemo } = useApp();
  const isFault = state.faultState === 'alert';

  const [timeStr, setTimeStr] = useState('');
  const [dateStr, setDateStr] = useState('');

  useEffect(() => {
    const now = new Date();
    setTimeStr(now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    setDateStr(now.toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' }));
  }, []);

  return (
    <header style={{
      height: 56,
      background: 'var(--bg-deep)',
      borderBottom: '1px solid var(--border-subtle)',
      display: 'flex',
      alignItems: 'center',
      padding: '0 24px',
      gap: 16,
      position: 'sticky',
      top: 0,
      zIndex: 40,
    }}>
      {/* Left — system status */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1 }}>
        <div style={{
          padding: '4px 12px',
          background: isFault ? 'var(--alert-dim)' : 'var(--normal-dim)',
          border: `1px solid ${isFault ? 'var(--alert-500)' : 'var(--normal-500)'}`,
          borderRadius: 4,
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <span className={isFault ? 'blink' : ''} style={{
            width: 8, height: 8, borderRadius: '50%',
            background: isFault ? 'var(--alert-500)' : 'var(--normal-500)',
            boxShadow: `0 0 8px ${isFault ? 'var(--alert-500)' : 'var(--normal-500)'}`,
            display: 'block',
          }} />
          <span style={{
            fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.1em',
            color: isFault ? 'var(--alert-500)' : 'var(--normal-500)',
          }}>
            {isFault ? '⚠ HIGH RISK OF FAULT' : '✓ SYSTEM NORMAL'}
          </span>
        </div>

        {state.latestResult && (
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-dim)' }}>
            Last scan: {state.lastPollTime}
          </span>
        )}

        {state.error && (
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--warn-500)', maxWidth: 300 }}>
            ⚠ {state.error.slice(0, 60)}...
          </span>
        )}
      </div>

      {/* Center — clock */}
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 16, color: 'var(--text-primary)', letterSpacing: '0.05em' }}>
          {timeStr}
        </div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-dim)', letterSpacing: '0.08em' }}>
          {dateStr}
        </div>
      </div>

      {/* Right — controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, justifyContent: 'flex-end' }}>
        {/* Model status */}
        {state.modelStatus && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '4px 10px',
            background: 'var(--bg-card)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 4,
          }}>
            <Cpu size={12} color={state.modelStatus.all_ready ? 'var(--normal-500)' : 'var(--warn-500)'} />
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-secondary)' }}>
              {state.modelStatus.loaded}/{state.modelStatus.total} models
            </span>
          </div>
        )}

        {/* Streaming status */}
        <StreamingStatus />

        {/* Demo buttons */}
        <button onClick={triggerNormalDemo} style={{
          padding: '5px 12px', borderRadius: 4, border: '1px solid var(--normal-500)',
          background: 'var(--normal-dim)', color: 'var(--normal-500)',
          fontFamily: 'var(--font-mono)', fontSize: 10, cursor: 'pointer', letterSpacing: '0.05em',
        }}>
          DEMO: NORMAL
        </button>
        <button onClick={triggerFaultDemo} style={{
          padding: '5px 12px', borderRadius: 4, border: '1px solid var(--alert-500)',
          background: 'var(--alert-dim)', color: 'var(--alert-500)',
          fontFamily: 'var(--font-mono)', fontSize: 10, cursor: 'pointer', letterSpacing: '0.05em',
          animation: isFault ? 'none' : undefined,
        }}>
          DEMO: FAULT
        </button>

        {/* Scan button */}
        <button
          onClick={() => runPipeline()}
          disabled={state.loading}
          style={{
            padding: '5px 14px', borderRadius: 4,
            border: '1px solid var(--accent-500)',
            background: 'var(--accent-dim)', color: 'var(--accent-400)',
            fontFamily: 'var(--font-mono)', fontSize: 10, cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 6,
            opacity: state.loading ? 0.5 : 1,
          }}
        >
          <RefreshCw size={11} className={state.loading ? 'animate-spin' : ''} />
          {state.loading ? 'SCANNING...' : 'RUN SCAN'}
        </button>
      </div>
    </header>
  );
}

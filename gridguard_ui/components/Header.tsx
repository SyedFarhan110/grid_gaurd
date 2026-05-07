'use client';
import { useState, useEffect } from 'react';
import { useApp } from '@/lib/store';
import { Cpu } from 'lucide-react';
import StreamingStatus from './StreamingStatus';

export default function Header() {
  const { state } = useApp();
  const isFault = state.faultState === 'alert';

  const [timeStr, setTimeStr] = useState('');
  const [dateStr, setDateStr] = useState('');

  useEffect(() => {
    const tick = () => {
      const now = new Date();
      setTimeStr(now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
      setDateStr(now.toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' }));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <>
      <header style={{
        height: 56,
        background: 'var(--bg-deep)',
        borderBottom: '1px solid var(--border-subtle)',
        display: 'flex',
        alignItems: 'center',
        padding: '0 16px',
        gap: 12,
        position: 'sticky',
        top: 0,
        zIndex: 40,
      }}>

        {/* ── Left: system status ── */}
        <div className="header-left" style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
          {/* Status badge */}
          <div style={{
            padding: '4px 10px',
            background: isFault ? 'var(--alert-dim)' : 'var(--normal-dim)',
            border: `1px solid ${isFault ? 'var(--alert-500)' : 'var(--normal-500)'}`,
            borderRadius: 4,
            display: 'flex', alignItems: 'center', gap: 7,
            flexShrink: 0,
          }}>
            <span className={isFault ? 'blink' : ''} style={{
              width: 8, height: 8, borderRadius: '50%',
              background: isFault ? 'var(--alert-500)' : 'var(--normal-500)',
              boxShadow: `0 0 8px ${isFault ? 'var(--alert-500)' : 'var(--normal-500)'}`,
              display: 'block', flexShrink: 0,
            }} />
            <span className="header-status-label" style={{
              fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.1em',
              color: isFault ? 'var(--alert-500)' : 'var(--normal-500)',
              whiteSpace: 'nowrap',
            }}>
              {isFault ? '⚠ HIGH RISK' : '✓ NORMAL'}
            </span>
          </div>

          {/* Last scan — hidden on small screens */}
          {state.latestResult && (
            <span className="header-scan-time" style={{
              fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-dim)',
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}>
              Last scan: {state.lastPollTime}
            </span>
          )}

          {/* Error — truncated on small screens */}
          {state.error && (
            <span style={{
              fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--warn-500)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 200,
            }}>
              ⚠ {state.error.slice(0, 50)}…
            </span>
          )}
        </div>

        {/* ── Center: clock ── */}
        <div className="header-clock" style={{ textAlign: 'center', flexShrink: 0 }}>
          <div style={{
            fontFamily: 'var(--font-mono)', fontSize: 15, color: 'var(--text-primary)', letterSpacing: '0.05em',
          }}>
            {timeStr}
          </div>
          <div className="header-date" style={{
            fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-dim)', letterSpacing: '0.08em',
          }}>
            {dateStr}
          </div>
        </div>

        {/* ── Right: controls ── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, justifyContent: 'flex-end' }}>
          {/* Model status — hidden on xs */}
          {state.modelStatus && (
            <div className="header-model-status" style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '4px 10px',
              background: 'var(--bg-card)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 4,
            }}>
              <Cpu size={12} color={state.modelStatus.all_ready ? 'var(--normal-500)' : 'var(--warn-500)'} />
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                {state.modelStatus.loaded}/{state.modelStatus.total} models
              </span>
            </div>
          )}

          <StreamingStatus />
        </div>
      </header>

      {/* ── Responsive overrides ── */}
      <style>{`
        /* Tablet: hide secondary info, shrink clock */
        @media (max-width: 768px) {
          .header-scan-time    { display: none !important; }
          .header-model-status { display: none !important; }
          .header-date         { display: none !important; }
        }

        /* Mobile: also shrink status label to icon-only */
        @media (max-width: 480px) {
          .header-status-label { display: none !important; }
          .header-clock        { display: none !important; }
        }

        /* Compensate for hamburger button on mobile */
        @media (max-width: 768px) {
          header {
            padding-left: 52px !important;
          }
        }
      `}</style>
    </>
  );
}
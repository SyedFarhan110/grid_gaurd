'use client';
import { useApp } from '@/lib/store';
import { useState, useEffect } from 'react';
import { Clock, CheckCircle, Circle, AlertTriangle, Wrench, Radio, Users } from 'lucide-react';

// ── Breakpoint hook ──────────────────────────────────────────────────────────
function useBreakpoint() {
  const [width, setWidth] = useState(
    typeof window !== 'undefined' ? window.innerWidth : 1024
  );
  useEffect(() => {
    const handler = () => setWidth(window.innerWidth);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);
  return { isMobile: width < 640, isTablet: width < 900, width };
}

// ── Constants ────────────────────────────────────────────────────────────────
const FAULT_FULL: Record<string, string> = {
  'LG': 'Line-to-Ground (LG)', 'LL': 'Line-to-Line (LL)',
  'LLG': 'Double Line-to-Ground (LLG)', 'LLL': 'Three-Phase (LLL)',
  'LLLG': 'Three-Phase-to-Ground (LLLG)', 'No Fault': 'No Fault',
};

const RECOVERY_STAGES = [
  { id: 'detect',  label: 'Fault Detection',     icon: AlertTriangle, duration: '0–5 min',   desc: 'Automated protection relays trip. SCADA alarm raised.' },
  { id: 'isolate', label: 'Fault Isolation',      icon: Radio,         duration: '5–15 min',  desc: 'Field crew dispatched. Affected feeder isolated from grid.' },
  { id: 'assess',  label: 'Damage Assessment',    icon: Wrench,        duration: '15–45 min', desc: 'Engineers inspect fault location. Severity assessed on-site.' },
  { id: 'repair',  label: 'Repair / Restoration', icon: Users,         duration: 'Variable',  desc: 'Physical repair or bypass circuit energized.' },
  { id: 'restore', label: 'Full Power Restored',  icon: CheckCircle,   duration: 'ETR',       desc: 'Grid re-synchronized. Consumers reconnected.' },
];

// ── ETR Timeline ─────────────────────────────────────────────────────────────
function ETRTimeline({
  typicalHours,
  minHours,
  maxHours,
}: {
  typicalHours: number;
  minHours: number;
  maxHours: number;
}) {
  return (
    <div style={{ position: 'relative', paddingLeft: 32 }}>
      {/* Vertical connector line */}
      <div style={{
        position: 'absolute', left: 11, top: 8, bottom: 8,
        width: 2, background: 'var(--border-dim)',
      }} />

      {RECOVERY_STAGES.map((stage, i) => {
        const Icon     = stage.icon;
        const isDone   = i === 0;
        const isActive = i === 1;

        return (
          <div key={stage.id} style={{ position: 'relative', marginBottom: 20 }}>
            {/* Circle on line */}
            <div style={{
              position: 'absolute', left: -32, top: 2,
              width: 22, height: 22, borderRadius: '50%',
              background: isDone ? 'var(--normal-500)' : isActive ? 'var(--warn-500)' : 'var(--bg-elevated)',
              border: `2px solid ${isDone ? 'var(--normal-500)' : isActive ? 'var(--warn-500)' : 'var(--border-dim)'}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: isActive ? '0 0 10px var(--warn-500)' : 'none',
              zIndex: 1,
            }}>
              <Icon size={10} color={isDone || isActive ? '#000' : 'var(--text-dim)'} />
            </div>

            <div style={{
              background: isActive ? 'rgba(255,170,0,0.06)' : 'var(--bg-elevated)',
              border: `1px solid ${isActive ? 'var(--warn-500)' : 'var(--border-subtle)'}`,
              borderRadius: 6, padding: '10px 14px',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, gap: 8 }}>
                <span style={{
                  fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700,
                  color: isDone ? 'var(--normal-500)' : isActive ? 'var(--warn-500)' : 'var(--text-secondary)',
                }}>
                  {stage.label}
                </span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-dim)', whiteSpace: 'nowrap' }}>
                  {stage.duration}
                </span>
              </div>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-dim)' }}>
                {stage.desc}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────────────────────
export default function ETR() {
  const { state }        = useApp();
  const { isMobile, isTablet } = useBreakpoint();

  const result = state.stickyFaultResult ?? state.latestResult;
  const etr    = result?.etr;

  if (!result || !etr) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          height: 300,
        }}>
          <div style={{ textAlign: 'center' }}>
            <Clock size={32} color="var(--text-dim)" style={{ margin: '0 auto 12px' }} />
            <p style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-dim)' }}>
              ETR is computed after fault classification
            </p>
          </div>
        </div>
      </div>
    );
  }

  const areaLabel = result?.localization?.zone ?? result?.localization?.substation_name ?? 'Area not available';
  const faultTypeLabel = result?.classification?.fault_type_label ?? 'Fault type not available';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* ── Header ── */}
      <div>
        <h2 style={{
          fontFamily: 'var(--font-display)',
          fontSize: isMobile ? 16 : 20,
          fontWeight: 800, color: 'var(--text-primary)', margin: 0,
        }}>
          Estimated Time to Recovery
        </h2>
        <p style={{
          fontFamily: 'var(--font-mono)',
          fontSize: isMobile ? 9 : 10,
          color: 'var(--text-dim)', margin: '4px 0 0', letterSpacing: '0.06em',
        }}>
          Shows predicted fault type and affected area ·{' '}
          {etr.source === 'ml_model' ? 'ML Model (np.expm1 inverse-log)' : 'Rule-based lookup table'}
        </p>
      </div>

      {/* ── ETR Summary card ── */}
      <div style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--warn-500)40',
        borderRadius: 8, padding: isMobile ? '12px 14px' : '16px 20px',
      }}>
        <div style={{
          fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-dim)',
          letterSpacing: '0.1em', marginBottom: 10,
        }}>
          ESTIMATED TIME TO RECOVERY
        </div>
        <div style={{
          fontFamily: 'var(--font-display)',
          fontSize: isMobile ? 24 : 32,
          fontWeight: 800, color: 'var(--warn-500)',
        }}>
          {etr.estimated_recovery}
        </div>
      </div>

      {/* ── Fault and area badges ── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr',
        gap: 12,
      }}>
        <div style={{
          background: 'var(--bg-card)', border: '1px solid var(--border-subtle)',
          borderRadius: 8, padding: 16,
        }}>
          <div style={{
            fontFamily: 'var(--font-mono)', fontSize: 11,
            color: 'var(--text-secondary)', letterSpacing: '0.06em',
          }}>
            PREDICTED FAULT TYPE
          </div>
          <div style={{
            marginTop: 6,
            fontFamily: 'var(--font-display)',
            fontSize: isMobile ? 16 : 18,
            fontWeight: 800,
            color: 'var(--text-primary)',
          }}>
            {faultTypeLabel}
          </div>

        </div>

        <div style={{
          background: 'var(--bg-card)', border: '1px solid var(--border-subtle)',
          borderRadius: 8, padding: 16,
        }}>
          <div style={{
            fontFamily: 'var(--font-mono)', fontSize: 11,
            color: 'var(--text-secondary)', letterSpacing: '0.06em',
          }}>
            AFFECTED AREA
          </div>
          <div style={{
            marginTop: 6,
            fontFamily: 'var(--font-display)',
            fontSize: isMobile ? 16 : 18,
            fontWeight: 800,
            color: 'var(--accent-500)',
          }}>
            {areaLabel}
          </div>
        </div>
      </div>

      {/* ── Recovery stages + response actions ── */}
      {/* Stack to single column on mobile/tablet */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: isTablet ? '1fr' : '1fr 1fr',
        gap: 16,
      }}>

        {/* Recovery stages timeline */}
        <div style={{
          background: 'var(--bg-card)', border: '1px solid var(--border-subtle)',
          borderRadius: 8, padding: 16,
        }}>
          <div style={{
            fontFamily: 'var(--font-mono)', fontSize: 11,
            color: 'var(--text-secondary)', marginBottom: 16, letterSpacing: '0.06em',
          }}>
            RECOVERY STAGES
          </div>
          <ETRTimeline
            typicalHours={etr.typical_hours}
            minHours={etr.min_hours}
            maxHours={etr.max_hours}
          />
        </div>

        {/* Response actions */}
        <div style={{
          background: 'var(--bg-card)', border: '1px solid var(--border-subtle)',
          borderRadius: 8, padding: 16,
        }}>
          <div style={{
            fontFamily: 'var(--font-mono)', fontSize: 11,
            color: 'var(--text-secondary)', marginBottom: 14, letterSpacing: '0.06em',
          }}>
            RESPONSE ACTIONS
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[
              {
                priority: 'IMMEDIATE',
                action: 'Dispatch field crew to ' + (result.localization?.zone ?? 'fault zone'),
                color: 'var(--alert-500)',
              },
              {
                priority: 'HIGH',
                action: 'Notify K-Electric control room of ' + (FAULT_FULL[etr.fault_type] ?? etr.fault_type),
                color: 'var(--warn-500)',
              },
              {
                priority: 'HIGH',
                action: 'Prepare bypass circuit for affected feeder',
                color: 'var(--warn-500)',
              },
              {
                priority: 'MEDIUM',
                action: 'Alert affected consumers via SMS / KESC app',
                color: 'var(--accent-400)',
              },
              {
                priority: 'LOW',
                action: 'Log incident in maintenance system for review',
                color: 'var(--text-secondary)',
              },
            ].map((item, i) => (
              <div
                key={i}
                style={{
                  display: 'flex', gap: 10, alignItems: 'flex-start',
                  padding: '8px 10px', borderRadius: 6,
                  background: 'var(--bg-elevated)',
                  border: `1px solid ${item.color}25`,
                  borderLeft: `3px solid ${item.color}`,
                }}
              >
                <span style={{
                  fontFamily: 'var(--font-mono)', fontSize: 9,
                  color: item.color, letterSpacing: '0.06em',
                  flexShrink: 0, marginTop: 1,
                }}>
                  {item.priority}
                </span>
                <span style={{
                  fontFamily: 'var(--font-mono)', fontSize: 10,
                  color: 'var(--text-secondary)',
                  wordBreak: 'break-word',       /* ← prevents overflow on narrow screens */
                }}>
                  {item.action}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
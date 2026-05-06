'use client';
import { useApp } from '@/lib/store';
import { Clock, CheckCircle, Circle, AlertTriangle, Wrench, Radio, Users } from 'lucide-react';

const RECOVERY_STAGES = [
  { id: 'detect',    label: 'Fault Detection',       icon: AlertTriangle, duration: '0–5 min',  desc: 'Automated protection relays trip. SCADA alarm raised.' },
  { id: 'isolate',   label: 'Fault Isolation',        icon: Radio,        duration: '5–15 min', desc: 'Field crew dispatched. Affected feeder isolated from grid.' },
  { id: 'assess',    label: 'Damage Assessment',      icon: Wrench,       duration: '15–45 min',desc: 'Engineers inspect fault location. Severity assessed on-site.' },
  { id: 'repair',    label: 'Repair / Restoration',   icon: Users,        duration: 'Variable', desc: 'Physical repair or bypass circuit energized.' },
  { id: 'restore',   label: 'Full Power Restored',    icon: CheckCircle,  duration: 'ETR',      desc: 'Grid re-synchronized. Consumers reconnected.' },
];

function ETRTimeline({ typicalHours, minHours, maxHours }: { typicalHours: number; minHours: number; maxHours: number }) {
  const stages = RECOVERY_STAGES;

  return (
    <div style={{ position: 'relative', paddingLeft: 32 }}>
      {/* Vertical line */}
      <div style={{ position: 'absolute', left: 11, top: 8, bottom: 8, width: 2, background: 'var(--border-dim)' }} />

      {stages.map((stage, i) => {
        const Icon = stage.icon;
        const isDone = i === 0;
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
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700,
                  color: isDone ? 'var(--normal-500)' : isActive ? 'var(--warn-500)' : 'var(--text-secondary)' }}>
                  {stage.label}
                </span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-dim)' }}>{stage.duration}</span>
              </div>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-dim)' }}>{stage.desc}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function ETR() {
  const { state } = useApp();
  const result = state.latestResult;
  const etr    = result?.etr;

  if (!result || !etr) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300 }}>
        <div style={{ textAlign: 'center' }}>
          <Clock size={32} color="var(--text-dim)" style={{ margin: '0 auto 12px' }} />
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-dim)' }}>
            ETR is computed after fault classification
          </p>
        </div>
      </div>
    );
  }

  const pct = Math.min(100, (etr.typical_hours / etr.max_hours) * 100);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* Header */}
      <div>
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
          Estimated Time to Recovery
        </h2>
        <p style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-dim)', margin: '4px 0 0', letterSpacing: '0.06em' }}>
          Based on fault type · {etr.source === 'ml_model' ? 'ML Model (np.expm1 inverse-log)' : 'Rule-based lookup table'}
        </p>
      </div>

      {/* ETR Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
        {[
          { label: 'MINIMUM ETR',  value: `${etr.min_hours}h`,     color: 'var(--normal-500)' },
          { label: 'TYPICAL ETR',  value: etr.estimated_recovery,  color: 'var(--warn-500)'   },
          { label: 'MAXIMUM ETR',  value: `${etr.max_hours}h`,     color: 'var(--alert-500)'  },
        ].map(({ label, value, color }) => (
          <div key={label} style={{
            background: 'var(--bg-card)', border: `1px solid ${color}40`,
            borderRadius: 8, padding: '16px 20px',
          }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-dim)', letterSpacing: '0.1em', marginBottom: 10 }}>{label}</div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 800, color }}>{value}</div>
          </div>
        ))}
      </div>

      {/* Progress bar */}
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: 8, padding: 16 }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-secondary)', marginBottom: 14, letterSpacing: '0.06em' }}>
          RECOVERY TIME RANGE — {etr.fault_type}
        </div>
        <div style={{ position: 'relative', height: 32, background: 'var(--bg-elevated)', borderRadius: 6, overflow: 'hidden' }}>
          {/* Min-max gradient bar */}
          <div style={{
            position: 'absolute', top: 0, bottom: 0,
            left: `${(etr.min_hours / etr.max_hours) * 100}%`,
            right: 0,
            background: 'linear-gradient(90deg, var(--normal-500)30, var(--alert-500)30)',
            borderRadius: '0 6px 6px 0',
          }} />
          {/* Typical marker */}
          <div style={{
            position: 'absolute', top: 4, bottom: 4,
            left: `${pct - 1}%`, width: 3,
            background: 'var(--warn-500)',
            borderRadius: 2,
            boxShadow: '0 0 8px var(--warn-500)',
          }} />
          {/* Labels */}
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', padding: '0 12px', gap: 8 }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--normal-500)' }}>{etr.min_hours}h</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-dim)' }}>min</span>
            <div style={{ flex: 1 }} />
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--warn-500)', fontWeight: 700 }}>~{etr.typical_hours}h typical</span>
            <div style={{ flex: 1 }} />
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-dim)' }}>max</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--alert-500)' }}>{etr.max_hours}h</span>
          </div>
        </div>
      </div>

      {/* Recovery stages timeline + response guide */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: 8, padding: 16 }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-secondary)', marginBottom: 16, letterSpacing: '0.06em' }}>
            RECOVERY STAGES
          </div>
          <ETRTimeline typicalHours={etr.typical_hours} minHours={etr.min_hours} maxHours={etr.max_hours} />
        </div>

        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: 8, padding: 16 }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-secondary)', marginBottom: 14, letterSpacing: '0.06em' }}>
            RESPONSE ACTIONS
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[
              { priority: 'IMMEDIATE', action: 'Dispatch field crew to ' + (result.localization?.zone ?? 'fault zone'), color: 'var(--alert-500)' },
              { priority: 'HIGH',      action: 'Notify K-Electric control room of ' + etr.fault_type, color: 'var(--warn-500)' },
              { priority: 'HIGH',      action: 'Prepare bypass circuit for affected feeder', color: 'var(--warn-500)' },
              { priority: 'MEDIUM',    action: 'Alert affected consumers via SMS / KESC app', color: 'var(--accent-400)' },
              { priority: 'LOW',       action: 'Log incident in maintenance system for review', color: 'var(--text-secondary)' },
            ].map((item, i) => (
              <div key={i} style={{
                display: 'flex', gap: 10, alignItems: 'flex-start',
                padding: '8px 10px', borderRadius: 6,
                background: 'var(--bg-elevated)', border: `1px solid ${item.color}25`,
                borderLeft: `3px solid ${item.color}`,
              }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: item.color, letterSpacing: '0.06em', flexShrink: 0, marginTop: 1 }}>{item.priority}</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-secondary)' }}>{item.action}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

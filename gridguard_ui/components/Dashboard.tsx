'use client';
import { useApp } from '@/lib/store';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, AreaChart, Area } from 'recharts';
import { Zap, Activity, Thermometer, AlertTriangle } from 'lucide-react';
import dynamic from 'next/dynamic';

const KarachiMap = dynamic(() => import('./KarachiMap'), {
  ssr: false,
  loading: () => (
    <div style={{ height: '100%', background: 'var(--bg-card)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-dim)' }}>Loading map...</span>
    </div>
  ),
});

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: 'var(--bg-elevated)', border: '1px solid var(--border-dim)',
      borderRadius: 6, padding: '8px 12px',
    }}>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-dim)', marginBottom: 4 }}>{label}</div>
      {payload.map((p: any) => (
        <div key={p.dataKey} style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: p.color }}>
          {p.name}: {typeof p.value === 'number' ? p.value.toFixed(1) : p.value}
        </div>
      ))}
    </div>
  );
};

function StatCard({ label, value, unit, icon: Icon, color }: {
  label: string; value: string | number; unit?: string;
  icon: any; color: string;
}) {
  return (
    <div style={{
      background: 'var(--bg-card)', border: '1px solid var(--border-subtle)',
      borderRadius: 8, padding: '14px 16px',
      display: 'flex', flexDirection: 'column', gap: 6,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-dim)', letterSpacing: '0.08em' }}>{label}</span>
        <Icon size={13} color={color} />
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
        <span style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 700, color }} suppressHydrationWarning>{value}</span>
        {unit && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-dim)' }}>{unit}</span>}
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { state } = useApp();
  const isFault = state.faultState === 'alert';
  const result  = state.latestResult;
  const readings = state.liveReadings.slice(-20);

  const faultProb = result ? Math.round(result.pipeline.fault_probability * 100) : 0;
  const alertProb = result ? Math.round(result.latent_alert.anomaly_probability * 100) : 0;

  const latestR = readings[readings.length - 1];
  const voltage = latestR ? latestR.voltage.toFixed(1)      : '220.0';
  const current = latestR ? latestR.current.toFixed(1)      : '145.0';
  const pf      = latestR ? latestR.power_factor.toFixed(2) : '0.88';
  const load    = latestR ? latestR.load.toFixed(1)         : '8.5';

  const alerts: { type: string; msg: string; severity: string; time: string }[] = [];
  if (readings.length > 1) {
    const vLast = readings[readings.length - 1]?.voltage;
    const vPrev = readings[readings.length - 5]?.voltage;
    if (vLast && vPrev && Math.abs(vLast - vPrev) > 5)
      alerts.push({ type: 'VOLTAGE', msg: `Voltage fluctuation detected (±${Math.abs(vLast - vPrev).toFixed(1)}V)`, severity: 'warn', time: 'Now' });
  }
  if (result?.latent_alert.anomaly_detected)
    alerts.push({ type: 'LOAD', msg: result.latent_alert.notes, severity: 'alert', time: state.lastPollTime || 'Recent' });
  if (isFault)
    alerts.push({ type: 'FAULT', msg: `Fault risk ${faultProb}% — ${result?.pipeline.risk_level}`, severity: 'critical', time: state.lastPollTime || 'Recent' });

  const sevColor = (s: string) =>
    s === 'critical' ? 'var(--alert-500)' : s === 'alert' ? 'var(--warn-500)' : 'var(--accent-500)';

  return (
    <>
      <div className="dashboard-root" style={{ display: 'flex', flexDirection: 'column', gap: 14, height: '100%' }}>

        {/* ── Status Banner ── */}
        <div style={{
          background: isFault ? 'var(--alert-dim)' : 'var(--normal-dim)',
          border: `1px solid ${isFault ? 'var(--alert-500)' : 'var(--normal-500)'}`,
          borderRadius: 10,
          padding: '16px 20px',
          display: 'flex', alignItems: 'center', gap: 16,
          position: 'relative', overflow: 'hidden', flexWrap: 'wrap',
        }}>
          {/* Glow blob */}
          <div style={{
            position: 'absolute', right: -40, top: -40,
            width: 180, height: 180, borderRadius: '50%',
            background: isFault
              ? 'radial-gradient(circle, rgba(255,59,92,0.15) 0%, transparent 70%)'
              : 'radial-gradient(circle, rgba(0,208,132,0.12) 0%, transparent 70%)',
            pointerEvents: 'none',
          }} />

          {/* Pulsing circle */}
          <div style={{ position: 'relative', width: 48, height: 48, flexShrink: 0 }}>
            <div className={isFault ? 'pulse-ring' : ''} style={{
              position: 'absolute', inset: 0, borderRadius: '50%',
              border: `2px solid ${isFault ? 'var(--alert-500)' : 'var(--normal-500)'}`,
            }} />
            <div style={{
              position: 'absolute', inset: 7, borderRadius: '50%',
              background: isFault ? 'var(--alert-500)' : 'var(--normal-500)',
              boxShadow: `0 0 20px ${isFault ? 'var(--alert-500)' : 'var(--normal-500)'}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Zap size={16} color="#000" />
            </div>
          </div>

          {/* Text block */}
          <div style={{ flex: 1, minWidth: 160 }}>
            <div style={{
              fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 800,
              color: isFault ? 'var(--alert-500)' : 'var(--normal-500)', letterSpacing: '-0.02em',
            }}>
              {isFault ? '⚠ HIGH RISK OF FAULT' : '✓ SYSTEM NORMAL'}
            </div>
            <div className="banner-subtitle" style={{
              fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-secondary)', marginTop: 4,
            }}>
              {isFault
                ? `Fault probability: ${faultProb}% — Risk level: ${result?.pipeline.risk_level} — Immediate attention required`
                : 'All feeders operating within normal parameters. Continuous monitoring active.'}
            </div>
          </div>

          {/* Risk numbers */}
          <div className="banner-stats" style={{ display: 'flex', gap: 16, flexShrink: 0 }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{
                fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 800,
                color: isFault ? 'var(--alert-500)' : 'var(--normal-500)',
              }} suppressHydrationWarning>{faultProb}%</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-dim)', letterSpacing: '0.08em' }}>FAULT RISK</div>
            </div>
            <div style={{ width: 1, background: 'var(--border-subtle)' }} />
            <div style={{ textAlign: 'center' }}>
              <div style={{
                fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 800,
                color: alertProb > 50 ? 'var(--warn-500)' : 'var(--text-secondary)',
              }} suppressHydrationWarning>{alertProb}%</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-dim)', letterSpacing: '0.08em' }}>ANOMALY RISK</div>
            </div>
          </div>
        </div>

        {/* ── Stats Row ── */}
        <div className="stats-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
          <StatCard label="AVG VOLTAGE"  value={voltage} unit="V"  icon={Zap}         color="var(--accent-400)" />
          <StatCard label="AVG CURRENT"  value={current} unit="A"  icon={Activity}    color="var(--warn-500)"   />
          <StatCard label="POWER FACTOR" value={pf}      unit=""   icon={Activity}    color="var(--normal-500)" />
          <StatCard label="FEEDER LOAD"  value={load}    unit="KW" icon={Thermometer} color="var(--alert-400)"  />
        </div>

        {/* ── Charts + Map + Alerts ── */}
        <div className="main-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, flex: 1, minHeight: 0 }}>

          {/* Live readings chart */}
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: 8, padding: 14 }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-secondary)', marginBottom: 10, letterSpacing: '0.06em' }}>
              LIVE READINGS — VOLTAGE / CURRENT
            </div>
            <ResponsiveContainer width="100%" height={130}>
              <AreaChart data={readings}>
                <defs>
                  <linearGradient id="voltGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="var(--accent-500)" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="var(--accent-500)" stopOpacity={0}   />
                  </linearGradient>
                  <linearGradient id="currGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="var(--warn-500)" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="var(--warn-500)" stopOpacity={0}   />
                  </linearGradient>
                </defs>
                <XAxis dataKey="time" tick={false} axisLine={false} tickLine={false} />
                <YAxis hide />
                <Tooltip content={<CustomTooltip />} />
                <Area type="monotone" dataKey="voltage" name="Voltage (V)" stroke="var(--accent-500)" strokeWidth={1.5} fill="url(#voltGrad)" dot={false} />
                <Area type="monotone" dataKey="current" name="Current (A)" stroke="var(--warn-500)"   strokeWidth={1.5} fill="url(#currGrad)" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
            <div style={{ display: 'flex', gap: 14, marginTop: 8 }}>
              {[['var(--accent-500)', 'Voltage'], ['var(--warn-500)', 'Current']].map(([c, l]) => (
                <div key={l as string} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <div style={{ width: 18, height: 2, background: c as string }} />
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-dim)' }}>{l}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Feeder load chart */}
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: 8, padding: 14 }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-secondary)', marginBottom: 10, letterSpacing: '0.06em' }}>
              FEEDER LOAD TREND (KW)
            </div>
            <ResponsiveContainer width="100%" height={130}>
              <LineChart data={readings}>
                <XAxis dataKey="time" tick={false} axisLine={false} tickLine={false} />
                <YAxis hide domain={['auto', 'auto']} />
                <Tooltip content={<CustomTooltip />} />
                <Line type="monotone" dataKey="load" name="Load (KW)" stroke="var(--alert-400)" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Karachi map */}
          <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: 8, overflow: 'hidden', minHeight: 260 }}>
            <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-secondary)', letterSpacing: '0.06em' }}>
                K-ELECTRIC GRID MAP — KARACHI
              </span>
              {isFault && result?.localization && (
                <span className="blink" style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--alert-500)' }}>
                  ● FAULT ZONE: {result.localization.zone}
                </span>
              )}
            </div>
            <div style={{ height: 220 }}>
              <KarachiMap
                faultZone={isFault && result?.localization ? result.localization.substation_name : null}
                faultDistance={result?.localization?.distance_km}
              />
            </div>
          </div>

          {/* Alerts panel */}
          <div style={{
            background: 'var(--bg-card)', border: '1px solid var(--border-subtle)',
            borderRadius: 8, padding: 14, display: 'flex', flexDirection: 'column', minHeight: 260,
          }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-secondary)', marginBottom: 10, letterSpacing: '0.06em' }}>
              ACTIVE ALERTS
            </div>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8, overflowY: 'auto' }} suppressHydrationWarning>
              {alerts.length === 0 ? (
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-dim)' }}>No active alerts</span>
                </div>
              ) : alerts.map((a, i) => (
                <div key={i} style={{
                  background: 'var(--bg-elevated)',
                  border: `1px solid ${sevColor(a.severity)}30`,
                  borderLeft: `3px solid ${sevColor(a.severity)}`,
                  borderRadius: 6, padding: '10px 12px',
                  display: 'flex', gap: 10, alignItems: 'flex-start',
                }}>
                  <AlertTriangle size={13} color={sevColor(a.severity)} style={{ marginTop: 1, flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3, gap: 8 }}>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: sevColor(a.severity), letterSpacing: '0.06em' }}>{a.type}</span>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-dim)', flexShrink: 0 }}>{a.time}</span>
                    </div>
                    <span style={{
                      fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-secondary)',
                      display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }} suppressHydrationWarning>{a.msg}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>

      {/* ── Responsive styles ── */}
      <style>{`
        /* Tablet: 2-col stats, single-col main grid */
        @media (max-width: 900px) {
          .stats-grid {
            grid-template-columns: repeat(2, 1fr) !important;
          }
          .main-grid {
            grid-template-columns: 1fr !important;
          }
          .banner-stats {
            width: 100%;
            justify-content: flex-end;
          }
        }

        /* Mobile: 2-col stats → keep; banner subtitle hidden */
        @media (max-width: 600px) {
          .stats-grid {
            grid-template-columns: repeat(2, 1fr) !important;
            gap: 8px !important;
          }
          .banner-subtitle {
            display: none !important;
          }
          .banner-stats {
            gap: 10px !important;
          }
        }

        /* XS: 2-col stats, tighter padding */
        @media (max-width: 400px) {
          .dashboard-root {
            gap: 10px !important;
          }
        }
      `}</style>
    </>
  );
}
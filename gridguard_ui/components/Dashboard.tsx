'use client';
import { useApp } from '@/lib/store';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, AreaChart, Area } from 'recharts';
import { Zap, Activity, Thermometer, AlertTriangle } from 'lucide-react';
import dynamic from 'next/dynamic';

const KarachiMap = dynamic(() => import('./KarachiMap'), { ssr: false, loading: () => (
  <div style={{ height: '100%', background: 'var(--bg-card)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-dim)' }}>Loading map...</span>
  </div>
)});

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-dim)', borderRadius: 6, padding: '8px 12px' }}>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-dim)', marginBottom: 4 }}>{label}</div>
      {payload.map((p: any) => (
        <div key={p.dataKey} style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: p.color }}>
          {p.name}: {typeof p.value === 'number' ? p.value.toFixed(1) : p.value}
        </div>
      ))}
    </div>
  );
};

function StatCard({ label, value, unit, icon: Icon, color, trend }: {
  label: string; value: string | number; unit?: string;
  icon: any; color: string; trend?: 'up' | 'down' | 'stable';
}) {
  return (
    <div style={{
      background: 'var(--bg-card)', border: '1px solid var(--border-subtle)',
      borderRadius: 8, padding: '16px 18px',
      display: 'flex', flexDirection: 'column', gap: 8,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-dim)', letterSpacing: '0.08em' }}>{label}</span>
        <Icon size={14} color={color} />
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
        <span style={{ fontFamily: 'var(--font-display)', fontSize: 26, fontWeight: 700, color }} suppressHydrationWarning>{value}</span>
        {unit && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-dim)' }}>{unit}</span>}
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { state } = useApp();
  const isFault   = state.faultState === 'alert';
  const result    = state.latestResult;
  const readings  = state.liveReadings.slice(-20);

  // Risk probability display
  const faultProb = result ? Math.round(result.pipeline.fault_probability * 100) : 0;
  const alertProb = result ? Math.round(result.latent_alert.anomaly_probability * 100) : 0;

  // Latest readings
  const latestR = readings[readings.length - 1];
  const voltage = latestR ? latestR.voltage.toFixed(1) : '220.0';
  const current = latestR ? latestR.current.toFixed(1) : '145.0';
  const pf      = latestR ? latestR.power_factor.toFixed(2) : '0.88';
  const load    = latestR ? latestR.load.toFixed(1) : '8.5';

  // Generate anomaly alerts from live data
  const alerts = [];
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

  const sevColor = (s: string) => s === 'critical' ? 'var(--alert-500)' : s === 'alert' ? 'var(--warn-500)' : 'var(--accent-500)';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, height: '100%' }}>

      {/* Top Status Banner */}
      <div style={{
        background: isFault ? 'var(--alert-dim)' : 'var(--normal-dim)',
        border: `1px solid ${isFault ? 'var(--alert-500)' : 'var(--normal-500)'}`,
        borderRadius: 10,
        padding: '20px 28px',
        display: 'flex', alignItems: 'center', gap: 24,
        position: 'relative', overflow: 'hidden',
      }}>
        {/* Glow blob */}
        <div style={{
          position: 'absolute', right: -40, top: -40,
          width: 180, height: 180, borderRadius: '50%',
          background: isFault ? 'radial-gradient(circle, rgba(255,59,92,0.15) 0%, transparent 70%)' : 'radial-gradient(circle, rgba(0,208,132,0.12) 0%, transparent 70%)',
          pointerEvents: 'none',
        }} />

        {/* Pulsing circle */}
        <div style={{ position: 'relative', width: 56, height: 56, flexShrink: 0 }}>
          <div className={isFault ? 'pulse-ring' : ''} style={{
            position: 'absolute', inset: 0, borderRadius: '50%',
            border: `2px solid ${isFault ? 'var(--alert-500)' : 'var(--normal-500)'}`,
          }} />
          <div style={{
            position: 'absolute', inset: 8, borderRadius: '50%',
            background: isFault ? 'var(--alert-500)' : 'var(--normal-500)',
            boxShadow: `0 0 20px ${isFault ? 'var(--alert-500)' : 'var(--normal-500)'}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Zap size={18} color="#000" />
          </div>
        </div>

        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 800,
            color: isFault ? 'var(--alert-500)' : 'var(--normal-500)', letterSpacing: '-0.02em' }}>
            {isFault ? '⚠ HIGH RISK OF FAULT' : '✓ SYSTEM NORMAL'}
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-secondary)', marginTop: 4 }}>
            {isFault
              ? `Fault probability: ${faultProb}% — Risk level: ${result?.pipeline.risk_level} — Immediate attention required`
              : 'All feeders operating within normal parameters. Continuous monitoring active.'}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 20, flexShrink: 0 }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 800,
              color: isFault ? 'var(--alert-500)' : 'var(--normal-500)' }} suppressHydrationWarning>
              {faultProb}%
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-dim)', letterSpacing: '0.08em' }}>FAULT RISK</div>
          </div>
          <div style={{ width: 1, background: 'var(--border-subtle)' }} />
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 800,
              color: alertProb > 50 ? 'var(--warn-500)' : 'var(--text-secondary)' }} suppressHydrationWarning>
              {alertProb}%
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-dim)', letterSpacing: '0.08em' }}>ANOMALY RISK</div>
          </div>
        </div>
      </div>

      {/* Stats Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
        <StatCard label="AVG VOLTAGE"    value={voltage} unit="V"   icon={Zap}         color="var(--accent-400)" />
        <StatCard label="AVG CURRENT"    value={current} unit="A"   icon={Activity}    color="var(--warn-500)"   />
        <StatCard label="POWER FACTOR"   value={pf}      unit=""    icon={Activity}    color="var(--normal-500)" />
        <StatCard label="FEEDER LOAD"    value={load}    unit="MW"  icon={Thermometer} color="var(--alert-400)"  />
      </div>

      {/* Fault stack moved to History screen */}

      {/* Charts + Map + Alerts */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, flex: 1 }}>

        {/* Live chart - voltage & current */}
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: 8, padding: 16 }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-secondary)', marginBottom: 12, letterSpacing: '0.06em' }}>
            LIVE READINGS — VOLTAGE / CURRENT
          </div>
          <ResponsiveContainer width="100%" height={140}>
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
          <div style={{ display: 'flex', gap: 16, marginTop: 8 }}>
            {[['var(--accent-500)', 'Voltage'], ['var(--warn-500)', 'Current']].map(([c, l]) => (
              <div key={l as string} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <div style={{ width: 20, height: 2, background: c as string }} />
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-dim)' }}>{l}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Load chart */}
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: 8, padding: 16 }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-secondary)', marginBottom: 12, letterSpacing: '0.06em' }}>
            FEEDER LOAD TREND (MW)
          </div>
          <ResponsiveContainer width="100%" height={140}>
            <LineChart data={readings}>
              <XAxis dataKey="time" tick={false} axisLine={false} tickLine={false} />
              <YAxis hide domain={['auto', 'auto']} />
              <Tooltip content={<CustomTooltip />} />
              <Line type="monotone" dataKey="load" name="Load (MW)" stroke="var(--alert-400)" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Karachi map */}
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: 8, overflow: 'hidden', minHeight: 280 }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-subtle)' }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-secondary)', letterSpacing: '0.06em' }}>
              K-ELECTRIC GRID MAP — KARACHI
            </span>
            {isFault && result?.localization && (
              <span className="blink" style={{ marginLeft: 12, fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--alert-500)' }}>
                ● FAULT ZONE: {result.localization.zone}
              </span>
            )}
          </div>
          <div style={{ height: 240 }}>
            <KarachiMap
              faultZone={isFault && result?.localization ? result.localization.substation_name : null}
              faultDistance={result?.localization?.distance_km}
            />
          </div>
        </div>

        {/* Alerts panel */}
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: 8, padding: 16, display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-secondary)', marginBottom: 12, letterSpacing: '0.06em' }}>
            ACTIVE ALERTS
          </div>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8, overflowY: 'auto' }} suppressHydrationWarning>
            {alerts.length === 0 ? (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-dim)' }}>No active alerts</span>
              </div>
            ) : alerts.map((a, i) => (
              <div key={i} style={{
                background: 'var(--bg-elevated)', border: `1px solid ${sevColor(a.severity)}30`,
                borderLeft: `3px solid ${sevColor(a.severity)}`,
                borderRadius: 6, padding: '10px 12px',
                display: 'flex', gap: 10, alignItems: 'flex-start',
              }}>
                <AlertTriangle size={13} color={sevColor(a.severity)} style={{ marginTop: 1, flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: sevColor(a.severity), letterSpacing: '0.06em' }}>{a.type}</span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-dim)' }}>{a.time}</span>
                  </div>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-secondary)' }} suppressHydrationWarning>{a.msg}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

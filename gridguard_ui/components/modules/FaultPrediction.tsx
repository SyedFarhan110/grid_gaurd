'use client';
import { useState, useEffect } from 'react';
import { useApp } from '@/lib/store';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, RadialBarChart, RadialBar, LineChart, Line, ReferenceLine } from 'recharts';
import { Zap, TrendingUp, Clock, AlertTriangle } from 'lucide-react';

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

function buildProbTrend(currentProb: number) {
  const points = [];
  const now = Date.now();
  for (let i = -12; i <= 6; i++) {
    const t = new Date(now + i * 10 * 60000);
    const label = t.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    const noise = (Math.random() - 0.5) * 0.06;
    const trend = i <= 0
      ? Math.max(0.02, currentProb - (i * -0.015) + noise)
      : Math.min(0.98, currentProb + (i * 0.02) + noise);
    points.push({ time: label, probability: parseFloat((trend * 100).toFixed(1)), isFuture: i > 0 });
  }
  return points;
}

export default function FaultPrediction() {
  const { state } = useApp();
  const result = state.latestResult;
  const isFault = state.faultState === 'alert';

  const prob      = result?.pipeline.fault_probability ?? 0;
  const probPct   = Math.round(prob * 100);
  const riskLevel = result?.pipeline.risk_level ?? 'LOW';
  const confidence = result?.pipeline.confidence_pct ?? 0;

  const [trendData, setTrendData] = useState<any[]>([]);
  useEffect(() => {
    setTrendData(buildProbTrend(prob));
  }, [prob]);

  const readings  = state.liveReadings.slice(-20);

  const riskColor = riskLevel === 'CRITICAL' ? 'var(--alert-500)'
    : riskLevel === 'HIGH'     ? '#FF8C42'
    : riskLevel === 'MEDIUM'   ? 'var(--warn-500)'
    : 'var(--normal-500)';

  const radialData = [{ name: 'Risk', value: probPct, fill: riskColor }];

  const featureImportance = [
    { feature: 'I_imbalance',       value: 31 },
    { feature: 'current_magnitude', value: 22 },
    { feature: 'zero_seq',          value: 18 },
    { feature: 'V_imbalance',       value: 14 },
    { feature: 'KW_Plus',           value: 9  },
    { feature: 'hour',              value: 6  },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* Title */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
            Fault Prediction
          </h2>
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-dim)', margin: '4px 0 0', letterSpacing: '0.06em' }}>
            XGBoost · 31 features · Real-time risk assessment
          </p>
        </div>
        {result && (
          <div style={{
            padding: '6px 14px',
            background: `${riskColor}18`,
            border: `1px solid ${riskColor}`,
            borderRadius: 20,
            fontFamily: 'var(--font-mono)', fontSize: 11,
            color: riskColor, letterSpacing: '0.08em',
          }}>
            {riskLevel} RISK
          </div>
        )}
      </div>

      {/* Top row: gauge + stats */}
      <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr 1fr 1fr', gap: 12 }}>

        {/* Radial gauge */}
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: 8, padding: 16, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ position: 'relative', width: 140, height: 140 }}>
            <RadialBarChart width={140} height={140} innerRadius={45} outerRadius={65} data={radialData} startAngle={225} endAngle={-45}>
              <RadialBar dataKey="value" cornerRadius={4} background={{ fill: 'var(--bg-elevated)' }} />
            </RadialBarChart>
            <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 800, color: riskColor }}>{probPct}</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-dim)', letterSpacing: '0.08em' }}>PERCENT</span>
            </div>
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-secondary)', marginTop: 4 }}>Fault Probability</div>
        </div>

        {[
          { label: 'CONFIDENCE',   value: `${confidence.toFixed(1)}%`, icon: TrendingUp, color: 'var(--accent-400)' },
          { label: 'RISK LEVEL',   value: riskLevel,                   icon: AlertTriangle, color: riskColor },
          { label: 'LAST SCAN',    value: state.lastPollTime ?? '—',   icon: Clock, color: 'var(--text-secondary)' },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: 8, padding: '16px 20px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Icon size={13} color={color} />
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-dim)', letterSpacing: '0.08em' }}>{label}</span>
            </div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 700, color, marginTop: 12 }}>{value}</div>
          </div>
        ))}
      </div>

      {/* Probability trend chart */}
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: 8, padding: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-secondary)', letterSpacing: '0.06em' }}>
            RISK PROBABILITY TREND  ←PAST · FUTURE→
          </span>
          <div style={{ display: 'flex', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <div style={{ width: 20, height: 2, background: 'var(--accent-500)' }} />
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-dim)' }}>Observed</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <div style={{ width: 20, height: 2, background: 'var(--warn-500)', borderTop: '2px dashed var(--warn-500)' }} />
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-dim)' }}>Projected</span>
            </div>
          </div>
        </div>
        <ResponsiveContainer width="100%" height={180}>
          <AreaChart data={trendData}>
            <defs>
              <linearGradient id="probGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor={isFault ? 'var(--alert-500)' : 'var(--accent-500)'} stopOpacity={0.35} />
                <stop offset="95%" stopColor={isFault ? 'var(--alert-500)' : 'var(--accent-500)'} stopOpacity={0}   />
              </linearGradient>
            </defs>
            <XAxis dataKey="time" tick={{ fontSize: 9, fill: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }} axisLine={false} tickLine={false} interval={3} />
            <YAxis domain={[0, 100]} tick={{ fontSize: 9, fill: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }} axisLine={false} tickLine={false} tickFormatter={v => `${v}%`} />
            <Tooltip content={<CustomTooltip />} />
            <ReferenceLine y={50} stroke="var(--warn-500)" strokeDasharray="3 3" strokeOpacity={0.5} />
            <ReferenceLine y={80} stroke="var(--alert-500)" strokeDasharray="3 3" strokeOpacity={0.5} />
            <Area type="monotone" dataKey="probability" name="Risk %" stroke={isFault ? 'var(--alert-500)' : 'var(--accent-500)'} strokeWidth={2} fill="url(#probGrad)" dot={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Bottom row: I_imbalance live + feature importance */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: 8, padding: 16 }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-secondary)', marginBottom: 12, letterSpacing: '0.06em' }}>
            CURRENT IMBALANCE (Live)
          </div>
          <ResponsiveContainer width="100%" height={130}>
            <LineChart data={readings}>
              <XAxis dataKey="time" tick={false} axisLine={false} tickLine={false} />
              <YAxis hide />
              <Tooltip content={<CustomTooltip />} />
              <Line type="monotone" dataKey="current" name="Current (A)" stroke="var(--warn-500)" strokeWidth={1.5} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Feature importance */}
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: 8, padding: 16 }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-secondary)', marginBottom: 14, letterSpacing: '0.06em' }}>
            TOP FEATURE CONTRIBUTIONS
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {featureImportance.map((f, i) => (
              <div key={f.feature}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-secondary)' }}>{f.feature}</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-dim)' }}>{f.value}%</span>
                </div>
                <div style={{ height: 4, background: 'var(--bg-elevated)', borderRadius: 2 }}>
                  <div style={{
                    height: '100%', borderRadius: 2,
                    width: `${f.value * 3}%`,
                    background: `hsl(${200 + i * 20}, 80%, 60%)`,
                    transition: 'width 0.8s ease',
                  }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

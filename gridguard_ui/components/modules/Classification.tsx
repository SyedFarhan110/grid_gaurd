'use client';
import { useApp } from '@/lib/store';
import { RadarChart, Radar, PolarGrid, PolarAngleAxis, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell } from 'recharts';
import { Tag, CheckCircle } from 'lucide-react';

const FAULT_COLORS: Record<string, string> = {
  'No Fault': 'var(--normal-500)',
  'LG':       'var(--accent-500)',   // Line-to-Ground
  'LL':       'var(--warn-500)',     // Line-to-Line
  'LLG':      '#FF8C42',             // Double Line-to-Ground
  'LLL':      'var(--alert-500)',    // Three-Phase
  'LLLG':     '#CC2244',             // Three-Phase-to-Ground
};

const FAULT_DESCRIPTIONS: Record<string, string> = {
  'No Fault': 'All phases operating normally. No intervention required.',
  'LG':       'Line-to-Ground fault. One phase contacted ground. Most common (~70%). Affects single feeder.',
  'LL':       'Line-to-Line fault. Two phases in contact. High fault current. Requires prompt isolation.',
  'LLG':      'Double Line-to-Ground. Two phases grounded simultaneously. Substation protection activates.',
  'LLL':      'Three-Phase fault. All phases affected symmetrically. Rare but severe. Full isolation required.',
  'LLLG':     'Three-Phase-to-Ground. Maximum severity. Emergency response required immediately.',
};

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-dim)', borderRadius: 6, padding: '8px 12px' }}>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-dim)', marginBottom: 4 }}>{label}</div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--accent-400)' }}>
        {payload[0]?.value?.toFixed(1)}%
      </div>
    </div>
  );
};

export default function Classification() {
  const { state } = useApp();
  const result = state.stickyFaultResult ?? state.latestResult;
  const cls    = result?.classification;

  const faultLabel = cls?.fault_type_label ?? 'No Fault';
  const confidence = cls?.confidence_pct ?? 0;
  const faultColor = FAULT_COLORS[faultLabel] ?? 'var(--text-secondary)';

  const probData = cls?.all_probabilities
    ? Object.entries(cls.all_probabilities).map(([name, value]) => ({
        name: name.replace(' (', '\n('),
        shortName: name.split(' ')[0],
        value: parseFloat(value.toFixed(1)),
        color: FAULT_COLORS[name] ?? 'var(--text-dim)',
      }))
    : [];

  // Radar chart data derived from probabilities
  const radarData = probData.map(d => ({ subject: d.shortName, value: d.value }));

  // Phase map for fault type to involved phases
  const PHASE_MAP: Record<string, { A: boolean; B: boolean; C: boolean; G: boolean }> = {
    'LG':       { A: true,  B: false, C: false, G: true  },
    'LL':       { A: false, B: true,  C: true,  G: false },
    'LLG':      { A: false, B: true,  C: true,  G: true  },
    'LLL':      { A: true,  B: true,  C: true,  G: false },
    'LLLG':     { A: true,  B: true,  C: true,  G: true  },
    'No Fault': { A: false, B: false, C: false, G: false },
  };
  const phases = PHASE_MAP[faultLabel] ?? PHASE_MAP['No Fault'];
  const phaseData = [
    { phase: 'Phase A (Ia)', value: phases.A ? 'FAULT' : 'NORMAL', abnormal: phases.A },
    { phase: 'Phase B (Ib)', value: phases.B ? 'FAULT' : 'NORMAL', abnormal: phases.B },
    { phase: 'Phase C (Ic)', value: phases.C ? 'FAULT' : 'NORMAL', abnormal: phases.C },
    { phase: 'Ground (G)',   value: phases.G ? 'INVOLVED' : 'CLEAR', abnormal: phases.G },
  ];

  if (!result || !cls) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300 }}>
          <div style={{ textAlign: 'center' }}>
            <Tag size={32} color="var(--text-dim)" style={{ margin: '0 auto 12px' }} />
            <p style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-dim)' }}>
              Run a pipeline scan to classify fault type
            </p>
          </div>
        </div>
        {/* Fault stack moved to History screen */}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* Header */}
      <div>
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
          Fault Classification
        </h2>
        <p style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-dim)', margin: '4px 0 0', letterSpacing: '0.06em' }}>
          Decision Tree Pipeline · Input: Ia, Ib, Ic, Va, Vb, Vc
        </p>
      </div>

      {/* Result banner */}
      <div style={{
        background: `${faultColor}12`,
        border: `1px solid ${faultColor}`,
        borderRadius: 10,
        padding: '20px 24px',
        display: 'flex', alignItems: 'center', gap: 20,
      }}>
        <div style={{
          width: 56, height: 56, borderRadius: 8,
          background: `${faultColor}20`,
          border: `2px solid ${faultColor}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          <Tag size={24} color={faultColor} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 800, color: faultColor, letterSpacing: '-0.02em' }}>
            {faultLabel}
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-secondary)', marginTop: 5, lineHeight: 1.6 }}>
            {FAULT_DESCRIPTIONS[faultLabel]}
          </div>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 32, fontWeight: 800, color: faultColor }}>
            {confidence.toFixed(1)}%
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-dim)', letterSpacing: '0.08em' }}>CONFIDENCE</div>
        </div>
      </div>

      {/* Fault stack moved to History screen */}

      {/* Charts + phases */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>

        {/* Bar chart - all probabilities */}
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: 8, padding: 16 }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-secondary)', marginBottom: 12, letterSpacing: '0.06em' }}>
            ALL CLASS PROBABILITIES
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={probData} layout="vertical">
              <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 9, fill: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }} axisLine={false} tickLine={false} tickFormatter={v => `${v}%`} />
              <YAxis type="category" dataKey="shortName" tick={{ fontSize: 9, fill: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }} axisLine={false} tickLine={false} width={50} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="value" radius={[0, 3, 3, 0]}>
                {probData.map((entry, i) => (
                  <Cell key={i} fill={entry.color} opacity={entry.name.includes(faultLabel.split(' ')[0]) ? 1 : 0.35} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Radar chart */}
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: 8, padding: 16 }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-secondary)', marginBottom: 12, letterSpacing: '0.06em' }}>
            PROBABILITY RADAR
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <RadarChart data={radarData}>
              <PolarGrid stroke="var(--border-subtle)" />
              <PolarAngleAxis dataKey="subject" tick={{ fontSize: 9, fill: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }} />
              <Radar dataKey="value" stroke={faultColor} fill={faultColor} fillOpacity={0.2} strokeWidth={1.5} />
            </RadarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Phase status indicators */}
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: 8, padding: 16 }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-secondary)', marginBottom: 14, letterSpacing: '0.06em' }}>
          PHASE INVOLVEMENT ANALYSIS
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
          {phaseData.map(p => (
            <div key={p.phase} style={{
              background: p.abnormal ? 'var(--alert-dim)' : 'var(--bg-elevated)',
              border: `1px solid ${p.abnormal ? 'var(--alert-500)' : 'var(--border-subtle)'}`,
              borderRadius: 6, padding: '12px 14px',
            }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-dim)', marginBottom: 6 }}>{p.phase}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {p.abnormal
                  ? <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--alert-500)', display: 'block', boxShadow: '0 0 6px var(--alert-500)' }} className="blink" />
                  : <CheckCircle size={12} color="var(--normal-500)" />
                }
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, color: p.abnormal ? 'var(--alert-500)' : 'var(--normal-500)' }}>
                  {p.value}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

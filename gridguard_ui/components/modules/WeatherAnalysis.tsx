'use client';
import { useState, useEffect } from 'react';
import { useApp } from '@/lib/store';
import { CloudRain, Wind, Thermometer, Droplets, Sun, AlertTriangle } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';

const WEATHER_IMPACTS = [
  { condition: 'High Temperature (>40°C)',  impact: 'Increases conductor sag, reduces insulation rating. Raises fault risk by ~18%.', severity: 'high'   },
  { condition: 'Heavy Rainfall (>20mm)',     impact: 'Insulation breakdown, tree contact faults. Increases SLG fault likelihood.', severity: 'high'   },
  { condition: 'High Wind Speed (>40km/h)', impact: 'Conductor swing, vegetation contact. Primary cause of line faults in feeders.', severity: 'medium' },
  { condition: 'High Humidity (>85%)',       impact: 'Moisture ingress into transformers, flashover risk on aged insulators.', severity: 'medium' },
  { condition: 'Lightning / Storms',         impact: 'Direct strike on line or induced surges. Requires surge arrester inspection.', severity: 'critical' },
];

const tempImpactData = [
  { range: '<30°C', riskAdj: -5  },
  { range: '30-35', riskAdj:  0  },
  { range: '35-40', riskAdj:  8  },
  { range: '40-42', riskAdj: 14  },
  { range: '>42°C', riskAdj: 22  },
];

const generateHourlyLoadEstimate = () => Array.from({ length: 24 }, (_, h) => {
  const base = h >= 8 && h <= 22 ? 9.5 : 6.2;
  const peak = h >= 12 && h <= 16 ? 3.5 : 0;
  const noise = (Math.random() - 0.5) * 0.8;
  return { hour: `${String(h).padStart(2, '0')}:00`, load: parseFloat((base + peak + noise).toFixed(1)) };
});

function WeatherCard({ icon: Icon, label, value, unit, color, warning }: {
  icon: any; label: string; value: string | number; unit?: string; color: string; warning?: string;
}) {
  return (
    <div style={{
      background: 'var(--bg-card)', border: `1px solid ${warning ? 'var(--warn-500)40' : 'var(--border-subtle)'}`,
      borderRadius: 8, padding: '14px 16px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <Icon size={16} color={color} />
        {warning && <AlertTriangle size={12} color="var(--warn-500)" />}
      </div>
      <div style={{ fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 700, color }}>{value}<span style={{ fontSize: 12, color: 'var(--text-dim)', marginLeft: 3, fontFamily: 'var(--font-mono)' }}>{unit}</span></div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-dim)', marginTop: 4, letterSpacing: '0.06em' }}>{label}</div>
      {warning && <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--warn-500)', marginTop: 6 }}>{warning}</div>}
    </div>
  );
}

export default function WeatherAnalysis() {
  const { state } = useApp();
  const w = state.weatherData;
  const [hourlyLoadEstimate, setHourlyLoadEstimate] = useState<any[]>([]);

  useEffect(() => {
    setHourlyLoadEstimate(generateHourlyLoadEstimate());
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
          Weather-Aware Analysis
        </h2>
        <p style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-dim)', margin: '4px 0 0', letterSpacing: '0.06em' }}>
          Karachi · K-Electric Grid · Environmental Impact Assessment
        </p>
      </div>

      {/* Weather cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
        <WeatherCard icon={Thermometer} label="TEMPERATURE"  value={w.temp}     unit="°C"   color="var(--alert-400)" warning={w.temp > 40 ? 'Extreme heat — high load risk' : undefined} />
        <WeatherCard icon={Droplets}   label="HUMIDITY"      value={w.humidity} unit="%"    color="var(--accent-400)" warning={w.humidity > 80 ? 'High moisture — insulation risk' : undefined} />
        <WeatherCard icon={Wind}       label="WIND SPEED"    value={w.wind}     unit="km/h" color="var(--text-secondary)" />
        <WeatherCard icon={CloudRain}  label="PRECIPITATION" value={w.rain}     unit="mm"   color="var(--accent-500)" />
      </div>

      {/* Hourly load + temp impact */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: 8, padding: 16 }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-secondary)', marginBottom: 12, letterSpacing: '0.06em' }}>
            ESTIMATED DAILY LOAD PATTERN (MW)
          </div>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={hourlyLoadEstimate}>
              <XAxis dataKey="hour" tick={{ fontSize: 8, fill: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }} axisLine={false} tickLine={false} interval={3} />
              <YAxis hide />
              <Tooltip
                contentStyle={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-dim)', borderRadius: 6, fontFamily: 'var(--font-mono)', fontSize: 11 }}
                itemStyle={{ color: 'var(--accent-400)' }}
              />
              <Bar dataKey="load" name="Load (MW)" radius={[2, 2, 0, 0]}>
                {hourlyLoadEstimate.map((d, i) => (
                  <Cell key={i} fill={d.load > 11 ? 'var(--alert-400)' : d.load > 9 ? 'var(--warn-500)' : 'var(--accent-500)'} opacity={0.85} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: 8, padding: 16 }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-secondary)', marginBottom: 12, letterSpacing: '0.06em' }}>
            TEMPERATURE → FAULT RISK ADJUSTMENT
          </div>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={tempImpactData} layout="vertical">
              <XAxis type="number" tick={{ fontSize: 9, fill: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }} axisLine={false} tickLine={false} tickFormatter={v => `+${v}%`} />
              <YAxis type="category" dataKey="range" tick={{ fontSize: 9, fill: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }} axisLine={false} tickLine={false} width={50} />
              <Tooltip
                contentStyle={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-dim)', borderRadius: 6, fontFamily: 'var(--font-mono)', fontSize: 11 }}
              />
              <Bar dataKey="riskAdj" name="Risk Adj." radius={[0, 3, 3, 0]}>
                {tempImpactData.map((d, i) => (
                  <Cell key={i} fill={d.riskAdj > 15 ? 'var(--alert-500)' : d.riskAdj > 5 ? 'var(--warn-500)' : 'var(--normal-500)'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Weather impact table */}
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: 8, padding: 16 }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-secondary)', marginBottom: 14, letterSpacing: '0.06em' }}>
          WEATHER CONDITIONS → GRID IMPACT ANALYSIS
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {WEATHER_IMPACTS.map((item, i) => {
            const sevColor = item.severity === 'critical' ? 'var(--alert-500)' : item.severity === 'high' ? 'var(--warn-500)' : 'var(--accent-400)';
            return (
              <div key={i} style={{
                display: 'grid', gridTemplateColumns: '200px 1fr 70px',
                gap: 16, alignItems: 'center',
                padding: '10px 14px', borderRadius: 6,
                background: 'var(--bg-elevated)', border: `1px solid ${sevColor}20`,
                borderLeft: `3px solid ${sevColor}`,
              }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-primary)' }}>{item.condition}</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-secondary)' }}>{item.impact}</span>
                <span style={{
                  fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.06em',
                  color: sevColor, textAlign: 'right', textTransform: 'uppercase',
                }}>{item.severity}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

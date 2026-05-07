'use client';
import { useApp } from '@/lib/store';
import { AlertTriangle, TrendingUp, Zap, Activity, Eye } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import FaultStack from '../FaultStack';

function InsightCard({ title, value, trigger, explanation, color, icon: Icon }: {
  title: string; value: string; trigger: string; explanation: string; color: string; icon: any;
}) {
  return (
    <div style={{
      background: 'var(--bg-card)', border: `1px solid ${color}30`,
      borderRadius: 8, padding: '14px 16px',
      borderLeft: `3px solid ${color}`,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <Icon size={13} color={color} />
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color, letterSpacing: '0.06em' }}>{title}</span>
      </div>
      <div style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 700, color, marginBottom: 6 }}>{value}</div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--warn-500)', marginBottom: 6 }}>↑ {trigger}</div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-dim)', lineHeight: 1.6 }}>{explanation}</div>
    </div>
  );
}

export default function AnomalyInsights() {
  const { state } = useApp();
  const result = state.latestResult;
  const readings = state.liveReadings.slice(-30);

  const isFault  = state.faultState === 'alert';
  const la       = result?.latent_alert;
  const alertType = la?.alert_type ?? 'NORMAL';

  const annotatedReadings = readings.map((r, i) => ({
    ...r,
    anomalyZone: i > 20 && isFault ? r.current + 15 : null,
  }));

  const alertColor = alertType === 'ANOMALY' ? 'var(--alert-500)' : alertType === 'SPIKE' ? 'var(--warn-500)' : 'var(--normal-500)';

  return (
    <>
      {/* Responsive styles */}
      <style>{`
        .anomaly-alert-banner {
          display: flex;
          align-items: center;
          gap: 16px;
          background: var(--bg-card);
          border-radius: 8px;
          padding: 12px 20px;
          flex-wrap: wrap;
        }
        .anomaly-alert-content {
          display: flex;
          align-items: center;
          gap: 10;
          flex: 1;
          min-width: 0;
        }
        .anomaly-prob-box {
          text-align: right;
          flex-shrink: 0;
        }
        .anomaly-model-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 16px;
        }
        @media (max-width: 640px) {
          .anomaly-alert-banner {
            flex-direction: column;
            align-items: flex-start;
            gap: 12px;
            padding: 12px 14px;
          }
          .anomaly-prob-box {
            text-align: left;
          }
          .anomaly-model-grid {
            grid-template-columns: 1fr;
          }
          .anomaly-insight-cards {
            grid-template-columns: 1fr !important;
          }
        }
        @media (min-width: 641px) and (max-width: 900px) {
          .anomaly-insight-cards {
            grid-template-columns: repeat(2, 1fr) !important;
          }
        }
      `}</style>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Header */}
        <div>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
            Anomaly Insights
          </h2>
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-dim)', margin: '4px 0 0', letterSpacing: '0.06em' }}>
            LightGBM Latent Alert · Explainability layer · Why was this predicted?
          </p>
        </div>

        {/* Alert state banner */}
        <div
          className="anomaly-alert-banner"
          style={{ background: `${alertColor}10`, border: `1px solid ${alertColor}` }}
        >
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, flex: 1, minWidth: 0 }}>
            <AlertTriangle size={18} color={alertColor} style={{ flexShrink: 0, marginTop: 2 }} />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 700, color: alertColor }}>
                {alertType === 'ANOMALY' ? 'Significant Anomaly Detected' : alertType === 'SPIKE' ? 'Load Spike Detected' : 'No Anomalies Detected'}
              </div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-secondary)', marginTop: 2, wordBreak: 'break-word' }}>
                {la?.notes ?? 'Feeder load and electrical parameters within normal operating range.'}
              </div>
            </div>
          </div>
          {la && (
            <div className="anomaly-prob-box">
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 800, color: alertColor }}>
                {Math.round(la.anomaly_probability * 100)}%
              </div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-dim)', letterSpacing: '0.08em' }}>ANOMALY PROB</div>
            </div>
          )}
        </div>

        {/* Fault Stack */}
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: 8, padding: 16 }}>
          <FaultStack moduleId="anomaly" title="Anomaly Stack" accentColor="var(--warn-500)" emptyMessage="Anomaly stack is empty." />
        </div>

        {/* Trigger cards */}
        <div className="anomaly-insight-cards" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
          {/* {triggers.map((t, i) => <InsightCard key={i} {...t} />)} */}
        </div>

        {/* Annotated live chart */}
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: 8, padding: 16 }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-secondary)', marginBottom: 12, letterSpacing: '0.06em' }}>
            CURRENT TREND WITH ANOMALY ZONE
          </div>
          <ResponsiveContainer width="100%" height={180}>
            <AreaChart data={annotatedReadings}>
              <defs>
                <linearGradient id="currGrad2" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="var(--accent-500)" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="var(--accent-500)" stopOpacity={0}   />
                </linearGradient>
                <linearGradient id="anomGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="var(--alert-500)" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="var(--alert-500)" stopOpacity={0}   />
                </linearGradient>
              </defs>
              <XAxis dataKey="time" tick={false} axisLine={false} tickLine={false} />
              <YAxis hide />
              <Tooltip
                contentStyle={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-dim)', borderRadius: 6, fontFamily: 'var(--font-mono)', fontSize: 11 }}
              />
              <ReferenceLine y={170} stroke="var(--warn-500)" strokeDasharray="4 4" label={{ value: 'Threshold', position: 'right', fill: 'var(--warn-500)', fontSize: 9, fontFamily: 'var(--font-mono)' }} />
              <Area type="monotone" dataKey="current"     name="Current (A)"  stroke="var(--accent-500)" strokeWidth={1.5} fill="url(#currGrad2)" dot={false} />
              <Area type="monotone" dataKey="anomalyZone" name="Anomaly Zone" stroke="var(--alert-500)"  strokeWidth={1}   fill="url(#anomGrad)"  dot={false} strokeDasharray="3 3" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Model transparency */}
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: 8, padding: 16 }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-secondary)', marginBottom: 14, letterSpacing: '0.06em' }}>
            MODEL TRANSPARENCY
          </div>
          <div className="anomaly-model-grid">
            {/* Fault Prediction Model */}
            <div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-dim)', marginBottom: 8 }}>FAULT PREDICTION MODEL</div>
              {[
                { label: 'Algorithm',  value: 'XGBoost Classifier'           },
                { label: 'Features',   value: '31 engineered features'       },
                { label: 'Key inputs', value: 'I_imbalance, zero_seq, lags'  },
                { label: 'Output',     value: 'Binary (fault / no fault)'    },
              ].map(({ label, value }) => (
                <div key={label} style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 4, padding: '5px 0', borderBottom: '1px solid var(--border-subtle)' }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-dim)' }}>{label}</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-secondary)', textAlign: 'right' }}>{value}</span>
                </div>
              ))}
            </div>

            {/* Latent Alert Model */}
            <div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-dim)', marginBottom: 8 }}>LATENT ALERT MODEL</div>
              {[
                { label: 'Algorithm',  value: 'LightGBM Classifier'          },
                { label: 'Features',   value: '52 weather + load features'   },
                { label: 'Key inputs', value: 'feeder_load, temp, humidity'  },
                { label: 'Output',     value: 'Anomaly probability (0–1)'    },
              ].map(({ label, value }) => (
                <div key={label} style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 4, padding: '5px 0', borderBottom: '1px solid var(--border-subtle)' }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-dim)' }}>{label}</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-secondary)', textAlign: 'right' }}>{value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
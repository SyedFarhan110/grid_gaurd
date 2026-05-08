'use client';
import { useApp } from '@/lib/store';
import { AlertTriangle, X, ShieldCheck, Clock, MapPin, Activity } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { useState } from 'react';

// ── Anomaly History Modal ────────────────────────────────────────────────────
function AnomalyHistoryModal({ onClose }: { onClose: () => void }) {
  const { state } = useApp();

  const rawRecords = state.history.filter(
    (r) =>
      r.latent_alert?.anomaly_detected === true &&
      r.latent_alert?.alert_type &&
      r.latent_alert.alert_type !== 'NORMAL'
  );

  // ── Deduplicate by Location ──
  // Ensures only the latest anomaly per substation/zone is shown
  const anomalyRecords = (() => {
    const unique: any[] = [];
    const seen = new Set<string>();

    for (const r of rawRecords) {
      const sub = r.localization?.substation_name;
      const zone = r.localization?.zone;
      const locKey = sub && zone ? `${sub}-${zone}` : sub || zone || 'central-grid';

      if (!seen.has(locKey)) {
        unique.push(r);
        seen.add(locKey);
      }
    }
    return unique;
  })();

  const alertColor = (type: string) =>
    type === 'ANOMALY' ? 'var(--alert-500)' : type === 'SPIKE' ? 'var(--warn-500)' : 'var(--normal-500)';

  // ── Map probability to karachi_feeder_v3 labels ──
  function getAnomalyNature(prob: number, type: string) {
    if (type === 'SPIKE') return 'load_spike';
    if (prob > 0.90) return 'heat_stress';
    if (prob > 0.82) return 'oscillation';
    return 'load_drop';
  }

  return (
    <>
      <style>{`
        @keyframes modalFadeIn {
          from { opacity: 0; transform: translateY(-12px) scale(0.98); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes backdropIn {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        .anomaly-modal-backdrop {
          position: fixed;
          inset: 0;
          z-index: 1000;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
          background: rgba(0, 0, 0, 0.72);
          backdrop-filter: blur(4px);
          animation: backdropIn 0.2s ease;
        }
        .anomaly-modal-box {
          position: relative;
          width: 100%;
          max-width: 680px;
          max-height: 80vh;
          display: flex;
          flex-direction: column;
          background: var(--bg-card);
          border: 1px solid var(--border-subtle);
          border-top: 3px solid var(--alert-500);
          border-radius: 10px;
          animation: modalFadeIn 0.22s cubic-bezier(0.16, 1, 0.3, 1);
          overflow: hidden;
        }
        .anomaly-modal-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 18px 20px 14px;
          border-bottom: 1px solid var(--border-subtle);
          flex-shrink: 0;
        }
        .anomaly-modal-body {
          overflow-y: auto;
          padding: 14px 20px 20px;
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .anomaly-modal-body::-webkit-scrollbar { width: 4px; }
        .anomaly-modal-body::-webkit-scrollbar-track { background: transparent; }
        .anomaly-modal-body::-webkit-scrollbar-thumb {
          background: var(--border-dim);
          border-radius: 4px;
        }
        .anomaly-record-card {
          background: var(--bg-elevated);
          border: 1px solid var(--border-subtle);
          border-radius: 8px;
          padding: 14px 16px;
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 14px;
          transition: border-color 0.15s;
        }
        .anomaly-record-card:hover {
          border-color: var(--border-dim);
        }
        /* Timestamp spans full width as a top header row */
        .anomaly-record-card > div:first-child {
          grid-column: 1 / -1;
          padding-bottom: 10px;
          border-bottom: 1px solid var(--border-subtle);
          margin-bottom: 2px;
        }
        .anomaly-record-label {
          font-family: var(--font-mono);
          font-size: 8px;
          letter-spacing: 0.1em;
          color: var(--text-dim);
          display: flex;
          align-items: center;
          gap: 4px;
          margin-bottom: 5px;
        }
        .anomaly-record-value {
          font-family: var(--font-mono);
          font-size: 11px;
          color: var(--text-secondary);
          line-height: 1.4;
        }
        @media (max-width: 520px) {
          .anomaly-record-card { grid-template-columns: 1fr; }
        }
      `}</style>

      {/* Backdrop */}
      <div className="anomaly-modal-backdrop" onClick={onClose}>
        <div className="anomaly-modal-box" onClick={(e) => e.stopPropagation()}>

          {/* Header */}
          <div className="anomaly-modal-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <AlertTriangle size={16} color="var(--alert-500)" />
              <div>
                <div style={{
                  fontFamily: 'var(--font-display)', fontSize: 15,
                  fontWeight: 800, color: 'var(--text-primary)',
                }}>
                  Previous Anomaly Detections
                </div>
                <div style={{
                  fontFamily: 'var(--font-mono)', fontSize: 9,
                  color: 'var(--text-dim)', marginTop: 2, letterSpacing: '0.06em',
                }}>
                  {anomalyRecords.length} unique location{anomalyRecords.length === 1 ? '' : 's'} flagged
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              style={{
                background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)',
                borderRadius: 6, padding: '6px 8px', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: 'var(--text-dim)',
              }}
            >
              <X size={14} />
            </button>
          </div>

          {/* Body */}
          <div className="anomaly-modal-body">
            {anomalyRecords.length === 0 ? (
              <div style={{
                padding: '40px 20px', textAlign: 'center',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
              }}>
                <ShieldCheck size={28} color="var(--normal-500)" />
                <div style={{
                  fontFamily: 'var(--font-mono)', fontSize: 11,
                  color: 'var(--text-dim)', lineHeight: 1.6,
                }}>
                  No anomalies detected in history.<br />
                  All past scans were within normal range.
                </div>
              </div>
            ) : anomalyRecords.map((r) => {
              const la = r.latent_alert;
              const color = alertColor(la.alert_type);
              const probPct = Math.round(la.anomaly_probability * 100);

              return (
                <div
                  key={r.id}
                  className="anomaly-record-card"
                  style={{ borderLeft: `3px solid ${color}` }}
                >
                  {/* Timestamp */}
                  <div>
                    <div className="anomaly-record-label">
                      <Clock size={8} /> TIMESTAMP
                    </div>
                    <div className="anomaly-record-value" suppressHydrationWarning>
                      {new Date(r.timestamp).toLocaleString('en-GB', {
                        dateStyle: 'medium', timeStyle: 'medium',
                      })}
                    </div>
                  </div>

                  {/* Alert type */}
                  <div>
                    <div className="anomaly-record-label">
                      <Activity size={8} /> ALERT TYPE
                    </div>
                    <div style={{
                      fontFamily: 'var(--font-mono)', fontSize: 12,
                      fontWeight: 700, color,
                    }}>
                      {la.alert_type}
                    </div>
                  </div>

                  {/* Anomaly probability */}
                  <div>
                    <div className="anomaly-record-label">ANOMALY PROBABILITY</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{
                        fontFamily: 'var(--font-display)', fontSize: 20,
                        fontWeight: 800, color,
                      }}>
                        {probPct}%
                      </span>
                      {/* Mini bar */}
                      <div style={{
                        flex: 1, height: 4, background: 'var(--bg-deep)',
                        borderRadius: 2, overflow: 'hidden',
                      }}>
                        <div style={{
                          height: '100%', width: `${probPct}%`,
                          background: color, borderRadius: 2,
                        }} />
                      </div>
                    </div>
                  </div>

                  {/* Anomaly / Nature of the event */}
                  <div>
                    <div className="anomaly-record-label">ANOMALY NATURE</div>
                    <div className="anomaly-record-value" style={{ color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
                      {getAnomalyNature(la.anomaly_probability, la.alert_type).replace('_', ' ')}
                    </div>
                  </div>

                  {/* Location — substation + zone with layered fallback */}
                  <div>
                    <div className="anomaly-record-label">
                      <MapPin size={8} /> DETECTED AREA / ZONE
                    </div>
                    <div className="anomaly-record-value">
                      {(() => {
                        const sub = r.localization?.substation_name;
                        const zone = r.localization?.zone;
                        if (sub && zone) return `${sub} · ${zone}`;
                        if (sub) return sub;
                        if (zone) return zone;
                        
                        // Look for capitalized names in notes (e.g. "Saddar", "Gulshan")
                        const notes = la?.notes ?? '';
                        const match = notes.match(/\b([A-Z][a-z]+(?:\s[A-Z][a-z]+)*)\b/);
                        if (match && !['Feeder', 'Load', 'Significant'].includes(match[1])) {
                           return `${match[1]} Sector`;
                        }
                        
                        return 'Karachi Central Grid';
                      })()}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
}

// ── Main Component ───────────────────────────────────────────────────────────
export default function AnomalyInsights() {
  const { state } = useApp();
  const result = state.latestResult;
  const readings = state.liveReadings.slice(-30);

  const isFault = state.faultState === 'alert';
  const la = result?.latent_alert;
  const alertType = la?.alert_type ?? 'NORMAL';

  const [modalOpen, setModalOpen] = useState(false);

  // Badge count — only anomalies from history
  const anomalyCount = state.history.filter(
    (r) =>
      r.latent_alert?.anomaly_detected === true &&
      r.latent_alert?.alert_type &&
      r.latent_alert.alert_type !== 'NORMAL'
  ).length;

  const annotatedReadings = readings.map((r, i) => ({
    ...r,
    anomalyZone: i > 20 && isFault ? r.current + 15 : null,
  }));

  const alertColor =
    alertType === 'ANOMALY' ? 'var(--alert-500)'
      : alertType === 'SPIKE' ? 'var(--warn-500)'
        : 'var(--normal-500)';

  return (
    <>
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
        .anomaly-prob-box {
          text-align: right;
          flex-shrink: 0;
        }
        .anomaly-model-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 16px;
        }
        .pass-anomaly-btn {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          padding: 7px 14px;
          border-radius: 6px;
          cursor: pointer;
          font-family: var(--font-mono);
          font-size: 10px;
          letter-spacing: 0.07em;
          font-weight: 600;
          background: transparent;
          border: 1px solid var(--alert-500);
          color: var(--alert-500);
          white-space: nowrap;
          flex-shrink: 0;
          transition: background 0.18s, color 0.18s, box-shadow 0.18s;
        }
        .pass-anomaly-btn:hover {
          background: var(--alert-500);
          color: #000;
          box-shadow: 0 0 16px color-mix(in srgb, var(--alert-500) 35%, transparent);
        }
        .pass-anomaly-btn .btn-badge {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-width: 16px;
          height: 16px;
          padding: 0 4px;
          border-radius: 8px;
          background: var(--alert-500);
          color: #000;
          font-size: 8px;
          font-weight: 800;
          transition: background 0.18s, color 0.18s;
        }
        .pass-anomaly-btn:hover .btn-badge {
          background: #000;
          color: var(--alert-500);
        }
        @media (max-width: 640px) {
          .anomaly-alert-banner {
            flex-direction: column;
            align-items: flex-start;
            gap: 12px;
            padding: 12px 14px;
          }
          .anomaly-prob-box { text-align: left; }
          .anomaly-model-grid { grid-template-columns: 1fr; }
          .anomaly-header-row {
            flex-direction: column !important;
            align-items: flex-start !important;
            gap: 10px !important;
          }
        }
      `}</style>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* ── Header row ── */}
        <div
          className="anomaly-header-row"
          style={{
            display: 'flex', alignItems: 'flex-start',
            justifyContent: 'space-between', gap: 12,
          }}
        >
          <div>
            <h2 style={{
              fontFamily: 'var(--font-display)', fontSize: 20,
              fontWeight: 800, color: 'var(--text-primary)', margin: 0,
            }}>
              Anomaly Insights
            </h2>
            <p style={{
              fontFamily: 'var(--font-mono)', fontSize: 10,
              color: 'var(--text-dim)', margin: '4px 0 0', letterSpacing: '0.06em',
            }}>
              LightGBM Latent Alert · Explainability layer · Why was this predicted?
            </p>
          </div>

          {/* Button */}
          <button
            type="button"
            className="pass-anomaly-btn"
            onClick={() => setModalOpen(true)}
          >
            <AlertTriangle size={11} />
            PASS ANOMALY DETECTION
            {anomalyCount > 0 && (
              <span className="btn-badge">{anomalyCount}</span>
            )}
          </button>
        </div>

        {/* ── Alert state banner ── */}
        <div
          className="anomaly-alert-banner"
          style={{ background: `${alertColor}10`, border: `1px solid ${alertColor}` }}
        >
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, flex: 1, minWidth: 0 }}>
            <AlertTriangle size={18} color={alertColor} style={{ flexShrink: 0, marginTop: 2 }} />
            <div style={{ minWidth: 0 }}>
              <div style={{
                fontFamily: 'var(--font-display)', fontSize: 16,
                fontWeight: 700, color: alertColor,
              }}>
                {alertType === 'ANOMALY' ? 'Significant Anomaly Detected'
                  : alertType === 'SPIKE' ? 'Load Spike Detected'
                    : 'No Anomalies Detected'}
              </div>
              <div style={{
                fontFamily: 'var(--font-mono)', fontSize: 10,
                color: 'var(--text-secondary)', marginTop: 2, wordBreak: 'break-word',
              }}>
                {la?.notes ?? 'Feeder load and electrical parameters within normal operating range.'}
              </div>
            </div>
          </div>
          {la && (
            <div className="anomaly-prob-box">
              <div style={{
                fontFamily: 'var(--font-display)', fontSize: 24,
                fontWeight: 800, color: alertColor,
              }}>
                {Math.round(la.anomaly_probability * 100)}%
              </div>
              <div style={{
                fontFamily: 'var(--font-mono)', fontSize: 9,
                color: 'var(--text-dim)', letterSpacing: '0.08em',
              }}>
                ANOMALY PROB
              </div>
            </div>
          )}
        </div>

        {/* ── Live chart ── */}
        <div style={{
          background: 'var(--bg-card)', border: '1px solid var(--border-subtle)',
          borderRadius: 8, padding: 16,
        }}>
          <div style={{
            fontFamily: 'var(--font-mono)', fontSize: 11,
            color: 'var(--text-secondary)', marginBottom: 12, letterSpacing: '0.06em',
          }}>
            CURRENT TREND WITH ANOMALY ZONE
          </div>
          <ResponsiveContainer width="100%" height={180}>
            <AreaChart data={annotatedReadings}>
              <defs>
                <linearGradient id="currGrad2" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--accent-500)" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="var(--accent-500)" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="anomGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--alert-500)" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="var(--alert-500)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="time" tick={false} axisLine={false} tickLine={false} />
              <YAxis hide />
              <Tooltip contentStyle={{
                background: 'var(--bg-elevated)', border: '1px solid var(--border-dim)',
                borderRadius: 6, fontFamily: 'var(--font-mono)', fontSize: 11,
              }} />
              <ReferenceLine
                y={170} stroke="var(--warn-500)" strokeDasharray="4 4"
                label={{ value: 'Threshold', position: 'right', fill: 'var(--warn-500)', fontSize: 9, fontFamily: 'var(--font-mono)' }}
              />
              <Area type="monotone" dataKey="current" name="Current (A)" stroke="var(--accent-500)" strokeWidth={1.5} fill="url(#currGrad2)" dot={false} />
              <Area type="monotone" dataKey="anomalyZone" name="Anomaly Zone" stroke="var(--alert-500)" strokeWidth={1} fill="url(#anomGrad)" dot={false} strokeDasharray="3 3" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* ── Model transparency ── */}
        <div style={{
          background: 'var(--bg-card)', border: '1px solid var(--border-subtle)',
          borderRadius: 8, padding: 16,
        }}>
          <div style={{
            fontFamily: 'var(--font-mono)', fontSize: 11,
            color: 'var(--text-secondary)', marginBottom: 14, letterSpacing: '0.06em',
          }}>
            MODEL TRANSPARENCY
          </div>
          <div className="anomaly-model-grid">
            <div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-dim)', marginBottom: 8 }}>FAULT PREDICTION MODEL</div>
              {[
                { label: 'Algorithm', value: 'XGBoost Classifier' },
                { label: 'Features', value: '31 engineered features' },
                { label: 'Key inputs', value: 'I_imbalance, zero_seq, lags' },
                { label: 'Output', value: 'Binary (fault / no fault)' },
              ].map(({ label, value }) => (
                <div key={label} style={{
                  display: 'flex', justifyContent: 'space-between',
                  flexWrap: 'wrap', gap: 4,
                  padding: '5px 0', borderBottom: '1px solid var(--border-subtle)',
                }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-dim)' }}>{label}</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-secondary)', textAlign: 'right' }}>{value}</span>
                </div>
              ))}
            </div>
            <div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-dim)', marginBottom: 8 }}>LATENT ALERT MODEL</div>
              {[
                { label: 'Algorithm', value: 'LightGBM Classifier' },
                { label: 'Features', value: '52 weather + load features' },
                { label: 'Key inputs', value: 'feeder_load, temp, humidity' },
                { label: 'Output', value: 'Anomaly probability (0–1)' },
              ].map(({ label, value }) => (
                <div key={label} style={{
                  display: 'flex', justifyContent: 'space-between',
                  flexWrap: 'wrap', gap: 4,
                  padding: '5px 0', borderBottom: '1px solid var(--border-subtle)',
                }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-dim)' }}>{label}</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-secondary)', textAlign: 'right' }}>{value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Modal (portal-like, rendered outside the flow) ── */}
      {modalOpen && <AnomalyHistoryModal onClose={() => setModalOpen(false)} />}
    </>
  );
}
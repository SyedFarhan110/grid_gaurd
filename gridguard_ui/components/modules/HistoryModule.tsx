'use client';
import { useApp } from '@/lib/store';
import { useState } from 'react';
import { History, Search, ChevronDown, AlertTriangle } from 'lucide-react';

type FilterType = 'all' | 'fault' | 'alert' | 'normal';

// ── Fix 1: receives filtered records as a prop (no longer self-sourcing from faultStacks)
function UnifiedFaultStack({ records }: { records: any[] }) {
  const [expanded, setExpanded] = useState<string | null>(null);

  if (records.length === 0) {
    return (
      <div style={{ padding: '20px', textAlign: 'center' }}>
        <p style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-dim)' }}>
          No faults recorded yet. Run pipeline scans to populate history.
        </p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {records.map((r, i) => {
        const key = r.id;
        const isExpanded = expanded === key;

        const riskColor =
          r.pipeline.risk_level === 'CRITICAL' ? 'var(--alert-500)'
          : r.pipeline.risk_level === 'HIGH'   ? '#FF8C42'
          : r.pipeline.risk_level === 'MEDIUM' ? 'var(--warn-500)'
          : 'var(--normal-500)';

        // Fix 1: stack name = fault type + zone, not a module ID
        const stackLabel = [
          r.classification?.fault_type_label ?? 'No fault',
          r.localization?.zone ? `· ${r.localization.zone}` : '',
        ].join(' ');

        // Per-module breakdown for the expanded detail
        const moduleBreakdown = [
          { id: 'Prediction',     value: `${(r.pipeline.fault_probability * 100).toFixed(1)}% probability`, color: riskColor },
          { id: 'Classification', value: r.classification?.fault_type_label ?? '—', color: 'var(--text-secondary)' },
          { id: 'Localization',   value: r.localization?.zone ?? '—',               color: 'var(--text-secondary)' },
          { id: 'ETR',            value: r.etr?.estimated_recovery ?? '—',           color: 'var(--text-secondary)' },
          { id: 'Anomaly',        value: r.latent_alert?.alert_type ?? '—',          color: r.latent_alert?.anomaly_detected ? 'var(--warn-500)' : 'var(--text-secondary)' },
        ];

        return (
          <div key={key}>
            <div
              onClick={() => setExpanded(isExpanded ? null : key)}
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 100px 150px 20px',
                gap: 12,
                padding: '10px 14px',
                background: isExpanded
                  ? 'var(--bg-elevated)'
                  : i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 6,
                cursor: 'pointer',
                transition: 'background 0.15s',
              }}
            >
              {/* Fix 1: label reflects what the fault IS, not which module it came from */}
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-secondary)' }}>
                {stackLabel}
              </div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10 }}>
                <span style={{ color: riskColor, fontWeight: 700 }}>{r.pipeline.risk_level}</span>
              </div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-secondary)' }} suppressHydrationWarning>
                {new Date(r.timestamp).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'medium' })}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
                <ChevronDown
                  size={12}
                  color="var(--text-dim)"
                  style={{ transform: isExpanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}
                />
              </div>
            </div>

            {/* Fix 1: expanded section shows per-module breakdown for this single fault */}
            {isExpanded && (
              <div style={{
                padding: '12px 14px',
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border-subtle)',
                borderTop: 'none',
                borderBottomLeftRadius: 6,
                borderBottomRightRadius: 6,
                display: 'grid',
                gridTemplateColumns: 'repeat(5, 1fr)',
                gap: 12,
                fontSize: 10,
              }}>
                {moduleBreakdown.map(m => (
                  <div key={m.id}>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-dim)', marginBottom: 4 }}>
                      {m.id.toUpperCase()}
                    </div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: m.color }}>
                      {m.value}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}


export default function HistoryModule() {
  const { state } = useApp();
  const [filter, setFilter]   = useState<FilterType>('all');
  const [search, setSearch]   = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);

  // Fix 2: one filtered list used by BOTH the fault stack and the table
  const records = state.history.filter(r => {
    if (filter === 'fault')  return r.pipeline.fault_predicted;
    // Fix 2: check both the boolean flag AND that alert_type is non-empty / non-'NORMAL'
    if (filter === 'alert')  return r.latent_alert.anomaly_detected && r.latent_alert.alert_type && r.latent_alert.alert_type !== 'NORMAL';
    if (filter === 'normal') return !r.pipeline.fault_predicted && !r.latent_alert.anomaly_detected;
    return true;
  }).filter(r =>
    search ? JSON.stringify(r).toLowerCase().includes(search.toLowerCase()) : true
  );

  const summary = state.summary;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
          Prediction History
        </h2>
        <p style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-dim)', margin: '4px 0 0', letterSpacing: '0.06em' }}>
          All pipeline runs · Compare predicted vs actual
        </p>
      </div>

      {/* Summary stats */}
      {summary && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10 }}>
          {[
            { label: 'TOTAL SCANS',      value: summary.total_predictions,       color: 'var(--text-secondary)' },
            { label: 'FAULTS PREDICTED', value: summary.total_faults_predicted,  color: 'var(--alert-500)'     },
            { label: 'ALERTS',           value: summary.total_latent_alerts,      color: 'var(--warn-500)'      },
            { label: 'FAULT RATE',       value: `${summary.fault_rate_pct}%`,     color: 'var(--alert-400)'     },
            { label: 'ALERT RATE',       value: `${summary.alert_rate_pct}%`,     color: 'var(--warn-500)'      },
          ].map(({ label, value, color }) => (
            <div key={label} style={{
              background: 'var(--bg-card)', border: '1px solid var(--border-subtle)',
              borderRadius: 8, padding: '12px 14px',
            }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-dim)', letterSpacing: '0.08em', marginBottom: 8 }}>{label}</div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 700, color }}>{value}</div>
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: 6 }}>
          {(['all', 'fault', 'alert', 'normal'] as FilterType[]).map(f => (
            <button key={f} onClick={() => setFilter(f)} style={{
              padding: '5px 12px', borderRadius: 4, cursor: 'pointer',
              fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase',
              background: filter === f ? 'var(--accent-dim)' : 'var(--bg-card)',
              border: `1px solid ${filter === f ? 'var(--accent-500)' : 'var(--border-subtle)'}`,
              color: filter === f ? 'var(--accent-400)' : 'var(--text-dim)',
            }}>{f}</button>
          ))}
        </div>
        <div style={{ flex: 1, position: 'relative' }}>
          <Search size={12} color="var(--text-dim)" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' }} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search history..."
            style={{
              width: '100%', padding: '6px 10px 6px 28px',
              background: 'var(--bg-card)', border: '1px solid var(--border-subtle)',
              borderRadius: 4, color: 'var(--text-secondary)',
              fontFamily: 'var(--font-mono)', fontSize: 10, outline: 'none',
            }}
          />
        </div>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-dim)' }}>
          {records.length} records
        </span>
      </div>

      {/* Unified Fault Stack — Fix 2: pass filtered records as a prop */}
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: 8, padding: 16 }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-secondary)', marginBottom: 12, letterSpacing: '0.06em', display: 'flex', alignItems: 'center', gap: 8 }}>
          <AlertTriangle size={13} color="var(--alert-500)" />
          ALL RECORDED FAULTS
        </div>
        <UnifiedFaultStack records={records} />
      </div>

      {/* Table */}
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: 8, overflow: 'hidden' }}>
        <div style={{
          display: 'grid', gridTemplateColumns: '180px 90px 90px 100px 90px 80px 1fr',
          gap: 0, padding: '10px 16px',
          background: 'var(--bg-elevated)', borderBottom: '1px solid var(--border-subtle)',
        }}>
          {['TIMESTAMP', 'FAULT', 'RISK', 'FAULT TYPE', 'LOCATION', 'ETR', 'ALERT'].map(h => (
            <span key={h} style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-dim)', letterSpacing: '0.08em' }}>{h}</span>
          ))}
        </div>

        <div style={{ maxHeight: 400, overflowY: 'auto' }}>
          {records.length === 0 ? (
            <div style={{ padding: '40px 20px', textAlign: 'center' }}>
              <History size={24} color="var(--text-dim)" style={{ margin: '0 auto 10px' }} />
              <p style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-dim)' }}>
                No records yet. Run a pipeline scan to populate history.
              </p>
            </div>
          ) : records.map((r, i) => {
            const isFault    = r.pipeline.fault_predicted;
            // Fix 2: consistent alert check with the filter
            const isAlert    = r.latent_alert.anomaly_detected && r.latent_alert.anomaly_detected && r.latent_alert.alert_type !== 'NORMAL'
            const isExpanded = expanded === r.id;
            const riskColor  =
              r.pipeline.risk_level === 'CRITICAL' ? 'var(--alert-500)'
              : r.pipeline.risk_level === 'HIGH'   ? '#FF8C42'
              : r.pipeline.risk_level === 'MEDIUM' ? 'var(--warn-500)'
              : 'var(--normal-500)';

            return (
              <div key={r.id}>
                <div
                  onClick={() => setExpanded(isExpanded ? null : r.id)}
                  style={{
                    display: 'grid', gridTemplateColumns: '180px 90px 90px 100px 90px 80px 1fr',
                    gap: 0, padding: '10px 16px', cursor: 'pointer',
                    borderBottom: '1px solid var(--border-subtle)',
                    background: isExpanded
                      ? 'var(--bg-elevated)'
                      : i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)',
                    transition: 'background 0.15s',
                  }}
                >
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-secondary)' }} suppressHydrationWarning>
                    {new Date(r.timestamp).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'medium' })}
                  </span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10 }}>
                    {isFault
                      ? <span style={{ color: 'var(--alert-500)' }} className="blink">⚠ YES</span>
                      : <span style={{ color: 'var(--normal-500)' }}>✓ NO</span>}
                  </span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: riskColor }}>
                    {r.pipeline.risk_level}
                  </span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-secondary)' }}>
                    {r.classification?.fault_type_label?.split(' ')[0] ?? '—'}
                  </span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-secondary)' }}>
                    {r.localization?.zone?.split(' ')[0] ?? '—'}
                  </span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-secondary)' }}>
                    {r.etr?.estimated_recovery ?? '—'}
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{
                      fontFamily: 'var(--font-mono)', fontSize: 9,
                      padding: '2px 8px', borderRadius: 10,
                      background: isAlert ? 'var(--warn-dim)' : 'transparent',
                      border: `1px solid ${isAlert ? 'var(--warn-500)' : 'var(--border-subtle)'}`,
                      color: isAlert ? 'var(--warn-500)' : 'var(--text-dim)',
                    }}>
                      {r.latent_alert.alert_type}
                    </span>
                    <ChevronDown size={12} color="var(--text-dim)" style={{ marginLeft: 'auto', transform: isExpanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
                  </div>
                </div>

                {isExpanded && (
                  <div style={{
                    padding: '12px 16px', background: 'var(--bg-elevated)',
                    borderBottom: '1px solid var(--border-subtle)',
                    display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12,
                  }}>
                    <div>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-dim)', marginBottom: 4, letterSpacing: '0.08em' }}>FAULT PROBABILITY</div>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: riskColor }}>
                        {(r.pipeline.fault_probability * 100).toFixed(1)}%
                      </div>
                    </div>
                    <div>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-dim)', marginBottom: 4, letterSpacing: '0.08em' }}>CLASSIFICATION</div>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-secondary)' }}>
                        {r.classification?.fault_type_label ?? 'N/A'}<br />
                        <span style={{ color: 'var(--text-dim)', fontSize: 9 }}>{r.classification?.confidence_pct?.toFixed(1)}% confidence</span>
                      </div>
                    </div>
                    <div>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-dim)', marginBottom: 4, letterSpacing: '0.08em' }}>SUBSTATION</div>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-secondary)' }}>
                        {r.localization?.substation_name ?? 'N/A'}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-dim)', marginBottom: 4, letterSpacing: '0.08em' }}>PIPELINE STAGES</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {r.pipeline_stages_run.map((s: string) => (
                          <span key={s} style={{
                            fontFamily: 'var(--font-mono)', fontSize: 8, padding: '2px 6px',
                            background: 'var(--accent-dim)', border: '1px solid var(--border-dim)',
                            borderRadius: 3, color: 'var(--accent-400)',
                          }}>{s.replace('_', ' ')}</span>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
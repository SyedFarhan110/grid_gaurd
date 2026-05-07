'use client';
import { useApp } from '@/lib/store';
import { useState, useEffect } from 'react';
import { History, Search, ChevronDown, AlertTriangle } from 'lucide-react';

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

type FilterType = 'all' | 'fault' | 'alert' | 'normal';

// ── Unified Fault Stack ───────────────────────────────────────────────────────
function UnifiedFaultStack({ records }: { records: any[] }) {
  const [expanded, setExpanded]  = useState<string | null>(null);
  const { isMobile, isTablet }   = useBreakpoint();

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
        const key        = r.id;
        const isExpanded = expanded === key;

        const riskColor =
          r.pipeline.risk_level === 'CRITICAL' ? 'var(--alert-500)'
          : r.pipeline.risk_level === 'HIGH'   ? '#FF8C42'
          : r.pipeline.risk_level === 'MEDIUM' ? 'var(--warn-500)'
          : 'var(--normal-500)';

        const stackLabel = [
          r.classification?.fault_type_label ?? 'No fault',
          r.localization?.zone ? `· ${r.localization.zone}` : '',
        ].join(' ');

        const moduleBreakdown = [
          { id: 'Prediction',     value: `${(r.pipeline.fault_probability * 100).toFixed(1)}% probability`, color: riskColor },
          { id: 'Classification', value: r.classification?.fault_type_label ?? '—', color: 'var(--text-secondary)' },
          { id: 'Localization',   value: r.localization?.zone ?? '—',               color: 'var(--text-secondary)' },
          { id: 'ETR',            value: r.etr?.estimated_recovery ?? '—',           color: 'var(--text-secondary)' },
          { id: 'Anomaly',        value: r.latent_alert?.alert_type ?? '—',
            color: r.latent_alert?.anomaly_detected ? 'var(--warn-500)' : 'var(--text-secondary)' },
        ];

        return (
          <div key={key}>
            {/* Row — stacks gracefully on mobile */}
            <div
              onClick={() => setExpanded(isExpanded ? null : key)}
              style={{
                display: 'grid',
                // Mobile: label + risk badge only; tablet: add timestamp; desktop: full
                gridTemplateColumns: isMobile
                  ? '1fr auto 20px'
                  : isTablet
                  ? '1fr 100px 130px 20px'
                  : '1fr 100px 150px 20px',
                gap: 12,
                padding: '10px 14px',
                background: isExpanded
                  ? 'var(--bg-elevated)'
                  : i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 6, cursor: 'pointer',
                transition: 'background 0.15s',
              }}
            >
              <div style={{
                fontFamily: 'var(--font-mono)', fontSize: 10,
                color: 'var(--text-secondary)',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {stackLabel}
              </div>

              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10 }}>
                <span style={{ color: riskColor, fontWeight: 700 }}>{r.pipeline.risk_level}</span>
              </div>

              {/* Timestamp — hidden on mobile */}
              {!isMobile && (
                <div style={{
                  fontFamily: 'var(--font-mono)', fontSize: 10,
                  color: 'var(--text-secondary)',
                }} suppressHydrationWarning>
                  {new Date(r.timestamp).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'medium' })}
                </div>
              )}

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
                <ChevronDown
                  size={12}
                  color="var(--text-dim)"
                  style={{
                    transform: isExpanded ? 'rotate(180deg)' : 'none',
                    transition: 'transform 0.2s',
                  }}
                />
              </div>
            </div>

            {/* Expanded module breakdown */}
            {isExpanded && (
              <div style={{
                padding: '12px 14px',
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border-subtle)',
                borderTop: 'none',
                borderBottomLeftRadius: 6, borderBottomRightRadius: 6,
                display: 'grid',
                // 5 cols on desktop, 2-3 on tablet/mobile
                gridTemplateColumns: isMobile
                  ? 'repeat(2, 1fr)'
                  : isTablet
                  ? 'repeat(3, 1fr)'
                  : 'repeat(5, 1fr)',
                gap: 12, fontSize: 10,
              }}>
                {moduleBreakdown.map((m) => (
                  <div key={m.id}>
                    <div style={{
                      fontFamily: 'var(--font-mono)', fontSize: 9,
                      color: 'var(--text-dim)', marginBottom: 4,
                    }}>
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

// ── Main Component ───────────────────────────────────────────────────────────
export default function HistoryModule() {
  const { state }              = useApp();
  const { isMobile, isTablet } = useBreakpoint();
  const [filter, setFilter]    = useState<FilterType>('all');
  const [search, setSearch]    = useState('');
  const [expanded, setExpanded]= useState<string | null>(null);

  const records = state.history
    .filter((r) => {
      if (filter === 'fault')  return r.pipeline.fault_predicted;
      if (filter === 'alert')  return r.latent_alert.anomaly_detected && r.latent_alert.alert_type && r.latent_alert.alert_type !== 'NORMAL';
      if (filter === 'normal') return !r.pipeline.fault_predicted && !r.latent_alert.anomaly_detected;
      return true;
    })
    .filter((r) =>
      search ? JSON.stringify(r).toLowerCase().includes(search.toLowerCase()) : true
    );

  const summary = state.summary;

  // ── Table column config ─────────────────────────────────────────────────────
  // Adapt columns shown based on viewport
  type Col = { key: string; label: string; width: string };
  const tableCols: Col[] = isMobile
    ? [
        { key: 'timestamp', label: 'TIME',       width: '1fr'  },
        { key: 'fault',     label: 'FAULT',      width: '60px' },
        { key: 'risk',      label: 'RISK',       width: '60px' },
        { key: 'chevron',   label: '',            width: '24px' },
      ]
    : isTablet
    ? [
        { key: 'timestamp',  label: 'TIMESTAMP',  width: '150px' },
        { key: 'fault',      label: 'FAULT',      width: '70px'  },
        { key: 'risk',       label: 'RISK',       width: '70px'  },
        { key: 'faulttype',  label: 'TYPE',       width: '90px'  },
        { key: 'etr',        label: 'ETR',        width: '70px'  },
        { key: 'alert',      label: 'ALERT',      width: '1fr'   },
        { key: 'chevron',    label: '',           width: '24px'  },
      ]
    : [
        { key: 'timestamp',  label: 'TIMESTAMP',  width: '180px' },
        { key: 'fault',      label: 'FAULT',      width: '90px'  },
        { key: 'risk',       label: 'RISK',       width: '90px'  },
        { key: 'faulttype',  label: 'FAULT TYPE', width: '100px' },
        { key: 'location',   label: 'LOCATION',   width: '90px'  },
        { key: 'etr',        label: 'ETR',        width: '80px'  },
        { key: 'alert',      label: 'ALERT',      width: '1fr'   },
        { key: 'chevron',    label: '',           width: '24px'  },
      ];

  const gridTemplate = tableCols.map((c) => c.width).join(' ');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* ── Header ── */}
      <div>
        <h2 style={{
          fontFamily: 'var(--font-display)',
          fontSize: isMobile ? 16 : 20,
          fontWeight: 800, color: 'var(--text-primary)', margin: 0,
        }}>
          Prediction History
        </h2>
        <p style={{
          fontFamily: 'var(--font-mono)',
          fontSize: isMobile ? 9 : 10,
          color: 'var(--text-dim)', margin: '4px 0 0', letterSpacing: '0.06em',
        }}>
          All pipeline runs · Compare predicted vs actual
        </p>
      </div>

      {/* ── Summary stats ── */}
      {summary && (
        <div style={{
          display: 'grid',
          // 5 cols on desktop, 3 on tablet, 2 on mobile
          gridTemplateColumns: isMobile
            ? 'repeat(2, 1fr)'
            : isTablet
            ? 'repeat(3, 1fr)'
            : 'repeat(5, 1fr)',
          gap: 10,
        }}>
          {[
            { label: 'TOTAL SCANS',      value: summary.total_predictions,      color: 'var(--text-secondary)' },
            { label: 'FAULTS PREDICTED', value: summary.total_faults_predicted, color: 'var(--alert-500)'     },
            { label: 'ALERTS',           value: summary.total_latent_alerts,     color: 'var(--warn-500)'      },
            { label: 'FAULT RATE',       value: `${summary.fault_rate_pct}%`,    color: 'var(--alert-400)'     },
            { label: 'ALERT RATE',       value: `${summary.alert_rate_pct}%`,    color: 'var(--warn-500)'      },
          ].map(({ label, value, color }) => (
            <div key={label} style={{
              background: 'var(--bg-card)', border: '1px solid var(--border-subtle)',
              borderRadius: 8, padding: isMobile ? '10px 12px' : '12px 14px',
            }}>
              <div style={{
                fontFamily: 'var(--font-mono)', fontSize: 9,
                color: 'var(--text-dim)', letterSpacing: '0.08em', marginBottom: 8,
              }}>{label}</div>
              <div style={{
                fontFamily: 'var(--font-display)',
                fontSize: isMobile ? 18 : 22,
                fontWeight: 700, color,
              }}>{value}</div>
            </div>
          ))}
        </div>
      )}

      {/* ── Filters + search ── */}
      <div style={{
        display: 'flex',
        flexDirection: isMobile ? 'column' : 'row',
        gap: 10, alignItems: isMobile ? 'stretch' : 'center',
      }}>
        {/* Filter buttons */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {(['all', 'fault', 'alert', 'normal'] as FilterType[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              style={{
                padding: '5px 12px', borderRadius: 4, cursor: 'pointer',
                fontFamily: 'var(--font-mono)', fontSize: 10,
                letterSpacing: '0.06em', textTransform: 'uppercase',
                background: filter === f ? 'var(--accent-dim)' : 'var(--bg-card)',
                border: `1px solid ${filter === f ? 'var(--accent-500)' : 'var(--border-subtle)'}`,
                color: filter === f ? 'var(--accent-400)' : 'var(--text-dim)',
              }}
            >{f}</button>
          ))}
        </div>

        {/* Search */}
        <div style={{ flex: 1, position: 'relative', minWidth: 0 }}>
          <Search
            size={12}
            color="var(--text-dim)"
            style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' }}
          />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search history..."
            style={{
              width: '100%', padding: '6px 10px 6px 28px',
              background: 'var(--bg-card)', border: '1px solid var(--border-subtle)',
              borderRadius: 4, color: 'var(--text-secondary)',
              fontFamily: 'var(--font-mono)', fontSize: 10, outline: 'none',
              boxSizing: 'border-box',
            }}
          />
        </div>

        <span style={{
          fontFamily: 'var(--font-mono)', fontSize: 10,
          color: 'var(--text-dim)', whiteSpace: 'nowrap',
        }}>
          {records.length} records
        </span>
      </div>

      {/* ── Unified Fault Stack ── */}
      <div style={{
        background: 'var(--bg-card)', border: '1px solid var(--border-subtle)',
        borderRadius: 8, padding: 16,
      }}>
        <div style={{
          fontFamily: 'var(--font-mono)', fontSize: 11,
          color: 'var(--text-secondary)', marginBottom: 12,
          letterSpacing: '0.06em',
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <AlertTriangle size={13} color="var(--alert-500)" />
          ALL RECORDED FAULTS
        </div>
        <UnifiedFaultStack records={records} />
      </div>

      {/* ── Table ── */}
      <div style={{
        background: 'var(--bg-card)', border: '1px solid var(--border-subtle)',
        borderRadius: 8, overflow: 'hidden',
      }}>

        {/* Table header */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: gridTemplate,
          gap: 0, padding: isMobile ? '8px 12px' : '10px 16px',
          background: 'var(--bg-elevated)',
          borderBottom: '1px solid var(--border-subtle)',
          overflowX: 'auto',
        }}>
          {tableCols.map((col) => (
            <span key={col.key} style={{
              fontFamily: 'var(--font-mono)', fontSize: 9,
              color: 'var(--text-dim)', letterSpacing: '0.08em',
            }}>{col.label}</span>
          ))}
        </div>

        {/* Table body */}
        <div style={{ maxHeight: 400, overflowY: 'auto', overflowX: 'auto' }}>
          {records.length === 0 ? (
            <div style={{ padding: '40px 20px', textAlign: 'center' }}>
              <History size={24} color="var(--text-dim)" style={{ margin: '0 auto 10px' }} />
              <p style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-dim)' }}>
                No records yet. Run a pipeline scan to populate history.
              </p>
            </div>
          ) : records.map((r, i) => {
            const isFault    = r.pipeline.fault_predicted;
            const isAlert    = r.latent_alert.anomaly_detected
              && r.latent_alert.alert_type
              && r.latent_alert.alert_type !== 'NORMAL';
            const isExpanded = expanded === r.id;

            const riskColor =
              r.pipeline.risk_level === 'CRITICAL' ? 'var(--alert-500)'
              : r.pipeline.risk_level === 'HIGH'   ? '#FF8C42'
              : r.pipeline.risk_level === 'MEDIUM' ? 'var(--warn-500)'
              : 'var(--normal-500)';

            return (
              <div key={r.id}>
                {/* Data row */}
                <div
                  onClick={() => setExpanded(isExpanded ? null : r.id)}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: gridTemplate,
                    gap: 0,
                    padding: isMobile ? '8px 12px' : '10px 16px',
                    cursor: 'pointer',
                    borderBottom: '1px solid var(--border-subtle)',
                    background: isExpanded
                      ? 'var(--bg-elevated)'
                      : i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)',
                    transition: 'background 0.15s',
                    alignItems: 'center',
                  }}
                >
                  {/* TIMESTAMP */}
                  <span style={{
                    fontFamily: 'var(--font-mono)', fontSize: 10,
                    color: 'var(--text-secondary)',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }} suppressHydrationWarning>
                    {new Date(r.timestamp).toLocaleString('en-GB', {
                      dateStyle: 'short', timeStyle: 'medium',
                    })}
                  </span>

                  {/* FAULT */}
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10 }}>
                    {isFault
                      ? <span style={{ color: 'var(--alert-500)' }} className="blink">⚠ YES</span>
                      : <span style={{ color: 'var(--normal-500)' }}>✓ NO</span>}
                  </span>

                  {/* RISK */}
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: riskColor }}>
                    {r.pipeline.risk_level}
                  </span>

                  {/* FAULT TYPE — tablet+ */}
                  {!isMobile && (
                    <span style={{
                      fontFamily: 'var(--font-mono)', fontSize: 10,
                      color: 'var(--text-secondary)',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {r.classification?.fault_type_label?.split(' ')[0] ?? '—'}
                    </span>
                  )}

                  {/* LOCATION — desktop only */}
                  {!isMobile && !isTablet && (
                    <span style={{
                      fontFamily: 'var(--font-mono)', fontSize: 10,
                      color: 'var(--text-secondary)',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {r.localization?.zone?.split(' ')[0] ?? '—'}
                    </span>
                  )}

                  {/* ETR — tablet+ */}
                  {!isMobile && (
                    <span style={{
                      fontFamily: 'var(--font-mono)', fontSize: 10,
                      color: 'var(--text-secondary)',
                    }}>
                      {r.etr?.estimated_recovery ?? '—'}
                    </span>
                  )}

                  {/* ALERT — tablet+ */}
                  {!isMobile && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                      <span style={{
                        fontFamily: 'var(--font-mono)', fontSize: 9,
                        padding: '2px 8px', borderRadius: 10,
                        background: isAlert ? 'var(--warn-dim)' : 'transparent',
                        border: `1px solid ${isAlert ? 'var(--warn-500)' : 'var(--border-subtle)'}`,
                        color: isAlert ? 'var(--warn-500)' : 'var(--text-dim)',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>
                        {r.latent_alert.alert_type}
                      </span>
                    </div>
                  )}

                  {/* Chevron */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
                    <ChevronDown
                      size={12}
                      color="var(--text-dim)"
                      style={{
                        transform: isExpanded ? 'rotate(180deg)' : 'none',
                        transition: 'transform 0.2s',
                      }}
                    />
                  </div>
                </div>

                {/* Expanded detail */}
                {isExpanded && (
                  <div style={{
                    padding: isMobile ? '10px 12px' : '12px 16px',
                    background: 'var(--bg-elevated)',
                    borderBottom: '1px solid var(--border-subtle)',
                    display: 'grid',
                    gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)',
                    gap: 12,
                  }}>
                    <div>
                      <div style={{
                        fontFamily: 'var(--font-mono)', fontSize: 9,
                        color: 'var(--text-dim)', marginBottom: 4, letterSpacing: '0.08em',
                      }}>FAULT PROBABILITY</div>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: riskColor }}>
                        {(r.pipeline.fault_probability * 100).toFixed(1)}%
                      </div>
                    </div>

                    <div>
                      <div style={{
                        fontFamily: 'var(--font-mono)', fontSize: 9,
                        color: 'var(--text-dim)', marginBottom: 4, letterSpacing: '0.08em',
                      }}>CLASSIFICATION</div>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-secondary)' }}>
                        {r.classification?.fault_type_label ?? 'N/A'}<br />
                        <span style={{ color: 'var(--text-dim)', fontSize: 9 }}>
                          {r.classification?.confidence_pct?.toFixed(1)}% confidence
                        </span>
                      </div>
                    </div>

                    <div>
                      <div style={{
                        fontFamily: 'var(--font-mono)', fontSize: 9,
                        color: 'var(--text-dim)', marginBottom: 4, letterSpacing: '0.08em',
                      }}>SUBSTATION</div>
                      <div style={{
                        fontFamily: 'var(--font-mono)', fontSize: 11,
                        color: 'var(--text-secondary)',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>
                        {r.localization?.substation_name ?? 'N/A'}
                      </div>
                    </div>

                    <div>
                      <div style={{
                        fontFamily: 'var(--font-mono)', fontSize: 9,
                        color: 'var(--text-dim)', marginBottom: 4, letterSpacing: '0.08em',
                      }}>PIPELINE STAGES</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {r.pipeline_stages_run.map((s: string) => (
                          <span key={s} style={{
                            fontFamily: 'var(--font-mono)', fontSize: 8,
                            padding: '2px 6px',
                            background: 'var(--accent-dim)',
                            border: '1px solid var(--border-dim)',
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
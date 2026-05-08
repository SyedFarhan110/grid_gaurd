'use client';
import { useApp } from '@/lib/store';
import { useState, useEffect, useMemo } from 'react';
import { History, Search, ChevronDown, ChevronUp } from 'lucide-react';
import { api, PipelineResult } from '@/lib/api';
import { CheckCircle, AlertCircle, HelpCircle, ShieldAlert, Loader2 } from 'lucide-react';

// ── Status Badge Component ───────────────────────────────────────────────────
function StatusBadge({ 
  id, 
  status = 'pending', 
  onUpdate 
}: { 
  id: string, 
  status?: string, 
  onUpdate: (id: string, s: string) => void 
}) {
  const config: any = {
    pending:        { icon: HelpCircle,  color: 'var(--text-dim)',       label: 'Pending' },
    investigated:   { icon: AlertCircle, color: 'var(--warn-500)',       label: 'Investigating' },
    resolved:       { icon: CheckCircle, color: 'var(--normal-500)',     label: 'Resolved' },
    false_positive: { icon: ShieldAlert, color: 'var(--text-dim)',       label: 'False Alarm' },
  };
  const active = config[status] || config.pending;
  const Icon = active.icon;

  const [loading, setLoading] = useState(false);

  const handleStatusChange = async (newStatus: string) => {
    setLoading(true);
    try {
      await api.updateResultStatus(id, newStatus);
      onUpdate(id, newStatus);
    } catch (err) {
      console.error("Failed to update status", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <select
        value={status}
        onChange={(e) => handleStatusChange(e.target.value)}
        disabled={loading}
        style={{
          appearance: 'none', background: 'transparent', border: 'none',
          position: 'absolute', inset: 0, width: '100%', opacity: 0, cursor: 'pointer'
        }}
      >
        <option value="pending">Pending</option>
        <option value="investigated">Investigated</option>
        <option value="resolved">Resolved</option>
        <option value="false_positive">False Positive</option>
      </select>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '3px 8px', borderRadius: 4,
        background: `${active.color}15`, border: `1px solid ${active.color}40`,
        color: active.color, fontFamily: 'var(--font-mono)', fontSize: 9,
        fontWeight: 600, pointerEvents: 'none'
      }}>
        {loading ? <Loader2 size={10} className="animate-spin" /> : <Icon size={10} />}
        {active.label.toUpperCase()}
      </div>
    </div>
  );
}


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

// ── Filtered Fault Stack ─────────────────────────────────────────────────────
function FilteredFaultStack({ faults }: { faults: PipelineResult[] }) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [detailedData, setDetailedData] = useState<Record<string, PipelineResult>>({});
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());
  const { isMobile } = useBreakpoint();

  const handleUpdateStatus = (id: string, status: string) => {
    if (detailedData[id]) {
      setDetailedData(prev => ({ ...prev, [id]: { ...prev[id], status: status as any } }));
    }
    // Remove from fault stack when resolved or marked as false positive
    if (status === 'resolved' || status === 'false_positive') {
      setHiddenIds(prev => new Set([...prev, id]));
      if (expandedId === id) setExpandedId(null);
    }
  };


  const toggleExpand = async (fault: PipelineResult, isArchived: boolean) => {
    if (expandedId === fault.id) {
      setExpandedId(null);
      return;
    }

    if (isArchived && !detailedData[fault.id]) {
      setLoadingId(fault.id);
      try {
        const fullData = await api.getResult(fault.id);
        setDetailedData(prev => ({ ...prev, [fault.id]: fullData }));
      } catch (err) {
        console.error("Failed to fetch fault details", err);
      } finally {
        setLoadingId(null);
      }
    }
    setExpandedId(fault.id);
  };

  function formatTimestamp(ts: string) {
    return new Date(ts).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'medium' });
  }

  function getFaultLocation(r: PipelineResult) {
    if (r.localization?.substation_name) return `${r.localization.substation_name} · ${r.localization.zone}`;
    if (r.latent_alert?.notes) return r.latent_alert.notes;
    return 'Location not available';
  }

  function DetailRow({ label, value }: { label: string; value: string }) {
    return (
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '4px 0', flexWrap: isMobile ? 'wrap' : 'nowrap' }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-dim)' }}>{label}</span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-secondary)', textAlign: isMobile ? 'left' : 'right' }}>{value}</span>
      </div>
    );
  }

  if (faults.length === 0) {
    return (
      <div style={{
        background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)',
        borderRadius: 8, padding: '20px 14px',
        fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-dim)', textAlign: 'center',
      }}>
        No faults match the selected filters.
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {faults.filter(f => !hiddenIds.has(f.id)).map((fault, index) => {
        const isArchived = index >= 5;
        const isOpen = expandedId === fault.id;
        const data = detailedData[fault.id] || fault;
        
        const riskColor =
          data.pipeline.risk_level === 'CRITICAL' ? 'var(--alert-500)'
            : data.pipeline.risk_level === 'HIGH' ? '#FF8C42'
              : data.pipeline.risk_level === 'MEDIUM' ? 'var(--warn-500)'
                : 'var(--normal-500)';

        return (
          <div key={fault.id}>
            <button
              type="button"
              onClick={() => toggleExpand(fault, isArchived)}
              style={{
                width: '100%', textAlign: 'left', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                gap: 12,
                background: isOpen ? 'var(--bg-card)' : 'var(--bg-elevated)',
                borderTop: `1px solid ${isOpen ? 'var(--accent-500)' : 'var(--border-subtle)'}`,
                borderRight: `1px solid ${isOpen ? 'var(--accent-500)' : 'var(--border-subtle)'}`,
                borderBottom: `1px solid ${isOpen ? 'var(--accent-500)' : 'var(--border-subtle)'}`,
                borderLeft: `3px solid ${riskColor}`,
                borderRadius: 8, padding: '12px 14px',
                flexDirection: isMobile ? 'column' : 'row',
                opacity: isArchived && !isOpen ? 0.7 : 1,
              }}
            >
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4, flexWrap: 'wrap' }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--accent-400)', letterSpacing: '0.06em' }}>
                    {getFaultLabel(data)}
                  </span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-dim)' }}>
                    {formatTimestamp(data.timestamp)}
                  </span>
                  {isArchived && !isOpen && (
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 8, color: 'var(--text-dim)', background: 'var(--bg-deep)', padding: '2px 5px', borderRadius: 3 }}>
                      ARCHIVED
                    </span>
                  )}
                  <StatusBadge id={data.id} status={data.status} onUpdate={handleUpdateStatus} />
                </div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                  {getFaultLocation(data)}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                {loadingId === fault.id ? (
                   <Loader2 size={16} className="animate-spin" color="var(--accent-500)" />
                ) : (
                  <>
                    <span style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 800, color: riskColor }}>
                      {(data.pipeline.fault_probability * 100).toFixed(1)}%
                    </span>
                    {isOpen
                      ? <ChevronUp size={16} color="var(--text-secondary)" />
                      : <ChevronDown size={16} color="var(--text-secondary)" />}
                  </>
                )}
              </div>
            </button>

            {isOpen && (
              <div style={{
                marginTop: 8, background: 'var(--bg-deep)',
                border: '1px solid var(--border-subtle)', borderRadius: 8, padding: 14,
              }}>
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: isMobile ? '1fr' : 'repeat(2, 1fr)',
                  gap: 16, marginBottom: 14,
                }}>
                  <div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-dim)', marginBottom: 8 }}>Prediction</div>
                    <DetailRow label="Risk level" value={data.pipeline.risk_level} />
                    <DetailRow label="Fault probability" value={`${(data.pipeline.fault_probability * 100).toFixed(1)}%`} />
                    <DetailRow label="Confidence" value={`${data.pipeline.confidence_pct}%`} />
                  </div>
                  <div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-dim)', marginBottom: 8 }}>Location</div>
                    <DetailRow label="Substation" value={data.localization?.substation_name ?? 'N/A'} />
                    <DetailRow label="Zone" value={data.localization?.zone ?? 'N/A'} />
                    <DetailRow label="Distance" value={data.localization ? `${data.localization.distance_km} km` : 'N/A'} />
                  </div>
                  <div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-dim)', marginBottom: 8 }}>Classification</div>
                    <DetailRow label="Type" value={getFaultLabel(data)} />
                    <DetailRow label="Code" value={data.classification ? String(data.classification.fault_type_code) : 'N/A'} />
                    <DetailRow label="Confidence" value={data.classification ? `${data.classification.confidence_pct}%` : 'N/A'} />
                  </div>
                  <div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-dim)', marginBottom: 8 }}>Recovery</div>
                    <DetailRow label="Estimate" value={data.etr?.estimated_recovery ?? 'N/A'} />
                    <DetailRow label="Range" value={data.etr ? `${data.etr.min_hours}h - ${data.etr.max_hours}h` : 'N/A'} />
                    <DetailRow label="Model source" value={data.etr?.source ?? 'N/A'} />
                  </div>
                </div>

                <div style={{ marginBottom: 14 }}>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-dim)', marginBottom: 8 }}>Latent Alert</div>
                  <DetailRow label="Alert type" value={data.latent_alert.alert_type} />
                  <DetailRow label="Probability" value={`${(data.latent_alert.anomaly_probability * 100).toFixed(1)}%`} />
                  <div style={{ marginTop: 4, fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                    {data.latent_alert.notes}
                  </div>
                </div>

                <div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-dim)', marginBottom: 8 }}>Pipeline Stages</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {data.pipeline_stages_run.map((stage: string) => (
                      <span key={stage} style={{
                        padding: '4px 8px', borderRadius: 4,
                        background: 'var(--bg-elevated)', border: '1px solid var(--border-dim)',
                        fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-secondary)',
                      }}>
                        {stage}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function getFaultLabel(r: PipelineResult) {
  const label = r.classification?.fault_type_label;
  if (label === 'No Fault' || !label) {
    return r.pipeline.fault_predicted ? 'Fault Detected' : 'Normal';
  }
  return label;
}

// ── Main Component ───────────────────────────────────────────────────────────
export default function HistoryModule() {
  const { state } = useApp();
  const { isMobile, isTablet } = useBreakpoint();
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);

  // ── Fault Stack filters ────────────────────────────────────────────────────
  const [locationFilter, setLocationFilter] = useState<string>('all');
  const [faultTypeFilter, setFaultTypeFilter] = useState<string>('all');

  const allFaults: PipelineResult[] = state.faultStacks?.anomaly ?? [];

  // Derive unique locations and fault types from the stack
  const uniqueLocations = useMemo(() => {
    const locs = allFaults
      .map((f) => f.localization?.zone ?? null)
      .filter((z): z is string => Boolean(z));
    return ['all', ...Array.from(new Set(locs))];
  }, [allFaults]);

  const uniqueFaultTypes = useMemo(() => {
    const types = allFaults
      .map((f) => f.classification?.fault_type_label ?? null)
      .filter((t): t is string => Boolean(t));
    return ['all', ...Array.from(new Set(types))];
  }, [allFaults]);

  const filteredFaults = useMemo(() => {
    return allFaults.filter((f) => {
      const matchesLocation =
        locationFilter === 'all' || f.localization?.zone === locationFilter;
      const matchesFaultType =
        faultTypeFilter === 'all' || f.classification?.fault_type_label === faultTypeFilter;
      return matchesLocation && matchesFaultType;
    });
  }, [allFaults, locationFilter, faultTypeFilter]);

  // ── Table records (search only) ───────────────────────────────────────────
  const records = state.history.filter((r) =>
    search ? JSON.stringify(r).toLowerCase().includes(search.toLowerCase()) : true
  );

  const summary = state.summary;

  type Col = { key: string; label: string; width: string };
  const tableCols: Col[] = isMobile
    ? [
      { key: 'timestamp', label: 'TIME', width: '1fr' },
      { key: 'fault', label: 'FAULT', width: '60px' },
      { key: 'risk', label: 'RISK', width: '60px' },
      { key: 'chevron', label: '', width: '24px' },
    ]
    : isTablet
      ? [
        { key: 'timestamp', label: 'TIMESTAMP', width: '150px' },
        { key: 'fault', label: 'FAULT', width: '70px' },
        { key: 'risk', label: 'RISK', width: '70px' },
        { key: 'faulttype', label: 'TYPE', width: '90px' },
        { key: 'etr', label: 'ETR', width: '70px' },
        { key: 'alert', label: 'ALERT', width: '1fr' },
        { key: 'chevron', label: '', width: '24px' },
      ]
      : [
        { key: 'timestamp', label: 'TIMESTAMP', width: '180px' },
        { key: 'fault', label: 'FAULT', width: '90px' },
        { key: 'risk', label: 'RISK', width: '90px' },
        { key: 'faulttype', label: 'FAULT TYPE', width: '100px' },
        { key: 'location', label: 'LOCATION', width: '90px' },
        { key: 'etr', label: 'ETR', width: '80px' },
        { key: 'status', label: 'STATUS', width: '120px' },
        { key: 'chevron', label: '', width: '24px' },
      ];

  const gridTemplate = tableCols.map((c) => c.width).join(' ');

  // ── Pill helper ───────────────────────────────────────────────────────────
  function FilterPill({
    value, active, onClick, maxWidth,
  }: { value: string; active: boolean; onClick: () => void; maxWidth?: number }) {
    return (
      <button
        type="button"
        onClick={onClick}
        style={{
          padding: '4px 10px', borderRadius: 4, cursor: 'pointer',
          fontFamily: 'var(--font-mono)', fontSize: 9,
          letterSpacing: '0.06em', textTransform: 'uppercase',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          maxWidth: maxWidth ?? 'none',
          background: active ? 'var(--accent-dim)' : 'var(--bg-elevated)',
          border: `1px solid ${active ? 'var(--accent-500)' : 'var(--border-subtle)'}`,
          color: active ? 'var(--accent-400)' : 'var(--text-dim)',
          transition: 'all 0.15s',
        }}
        title={value}
      >
        {value === 'all' ? 'ALL' : value}
      </button>
    );
  }

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
          gridTemplateColumns: isMobile
            ? 'repeat(2, 1fr)'
            : isTablet
              ? 'repeat(3, 1fr)'
              : 'repeat(5, 1fr)',
          gap: 10,
        }}>
          {[
            { label: 'TOTAL SCANS', value: summary.total_predictions, color: 'var(--text-secondary)' },
            { label: 'FAULTS PREDICTED', value: summary.total_faults_predicted, color: 'var(--alert-500)' },
            { label: 'ALERTS', value: summary.total_latent_alerts, color: 'var(--warn-500)' },
            { label: 'FAULT RATE', value: `${summary.fault_rate_pct}%`, color: 'var(--alert-400)' },
            { label: 'ALERT RATE', value: `${summary.alert_rate_pct}%`, color: 'var(--warn-500)' },
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

      {/* ── Fault Stack ── */}
      <div style={{
        background: 'var(--bg-card)', border: '1px solid var(--border-subtle)',
        borderRadius: 8, padding: 16,
      }}>
        {/* Stack header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          marginBottom: 14, flexWrap: 'wrap', gap: 8,
        }}>
          <div style={{
            fontFamily: 'var(--font-mono)', fontSize: 11,
            color: 'var(--text-secondary)', letterSpacing: '0.06em',
          }}>
            FAULT STACK
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-dim)' }}>
            {filteredFaults.length} / {allFaults.length} records
          </div>
        </div>

        {/* Filters */}
        <div style={{
          display: 'flex', flexDirection: isMobile ? 'column' : 'row',
          gap: 12, marginBottom: 14,
        }}>
          {/* Location filter */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1 }}>
            <span style={{
              fontFamily: 'var(--font-mono)', fontSize: 9,
              color: 'var(--text-dim)', letterSpacing: '0.08em',
            }}>
              LOCATION
            </span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
              {uniqueLocations.map((loc) => (
                <FilterPill
                  key={loc}
                  value={loc}
                  active={locationFilter === loc}
                  onClick={() => setLocationFilter(loc)}
                  maxWidth={140}
                />
              ))}
            </div>
          </div>

          {/* Divider */}
          {!isMobile && (
            <div style={{ width: 1, background: 'var(--border-subtle)', alignSelf: 'stretch' }} />
          )}

          {/* Fault type filter */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1 }}>
            <span style={{
              fontFamily: 'var(--font-mono)', fontSize: 9,
              color: 'var(--text-dim)', letterSpacing: '0.08em',
            }}>
              FAULT TYPE
            </span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
              {uniqueFaultTypes.map((type) => (
                <FilterPill
                  key={type}
                  value={type}
                  active={faultTypeFilter === type}
                  onClick={() => setFaultTypeFilter(type)}
                  maxWidth={160}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Stack */}
        <FilteredFaultStack faults={filteredFaults} />
      </div>

      {/* ── Search ── */}
      <div style={{
        display: 'flex',
        flexDirection: isMobile ? 'column' : 'row',
        gap: 10, alignItems: isMobile ? 'stretch' : 'center',
      }}>
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

      {/* ── Table ── */}
      <div style={{
        background: 'var(--bg-card)', border: '1px solid var(--border-subtle)',
        borderRadius: 8, overflow: 'hidden',
      }}>
        {/* Table header */}
        <div style={{
          display: 'grid', gridTemplateColumns: gridTemplate,
          gap: 0, padding: isMobile ? '8px 12px' : '10px 16px',
          background: 'var(--bg-elevated)', borderBottom: '1px solid var(--border-subtle)',
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
            const isFault = r.pipeline.fault_predicted;
            const isAlert = r.latent_alert.anomaly_detected
              && r.latent_alert.alert_type
              && r.latent_alert.alert_type !== 'NORMAL';
            const isExpanded = expanded === r.id;

            const riskColor =
              r.pipeline.risk_level === 'CRITICAL' ? 'var(--alert-500)'
                : r.pipeline.risk_level === 'HIGH' ? '#FF8C42'
                  : r.pipeline.risk_level === 'MEDIUM' ? 'var(--warn-500)'
                    : 'var(--normal-500)';

            return (
              <div key={r.id}>
                <div
                  onClick={() => setExpanded(isExpanded ? null : r.id)}
                  style={{
                    display: 'grid', gridTemplateColumns: gridTemplate,
                    gap: 0, padding: isMobile ? '8px 12px' : '10px 16px',
                    cursor: 'pointer', borderBottom: '1px solid var(--border-subtle)',
                    background: isExpanded
                      ? 'var(--bg-elevated)'
                      : i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)',
                    transition: 'background 0.15s', alignItems: 'center',
                  }}
                >
                  <span style={{
                    fontFamily: 'var(--font-mono)', fontSize: 10,
                    color: 'var(--text-secondary)',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }} suppressHydrationWarning>
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

                  {!isMobile && (
                    <span style={{
                      fontFamily: 'var(--font-mono)', fontSize: 10,
                      color: 'var(--text-secondary)',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {r.classification?.fault_type_label?.split(' ')[0] ?? '—'}
                    </span>
                  )}

                  {!isMobile && !isTablet && (
                    <span style={{
                      fontFamily: 'var(--font-mono)', fontSize: 10,
                      color: 'var(--text-secondary)',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {r.localization?.zone?.split(' ')[0] ?? '—'}
                    </span>
                  )}

                  {!isMobile && (
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-secondary)' }}>
                      {r.etr?.estimated_recovery ?? '—'}
                    </span>
                  )}

                  {!isMobile && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <StatusBadge id={r.id} status={r.status} onUpdate={() => {}} />
                    </div>
                  )}

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
                    <ChevronDown
                      size={12} color="var(--text-dim)"
                      style={{ transform: isExpanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}
                    />
                  </div>
                </div>

                {isExpanded && (
                  <div style={{
                    padding: isMobile ? '10px 12px' : '12px 16px',
                    background: 'var(--bg-elevated)', borderBottom: '1px solid var(--border-subtle)',
                    display: 'grid',
                    gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)',
                    gap: 12,
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
                        {getFaultLabel(r)}<br />
                        <span style={{ color: 'var(--text-dim)', fontSize: 9 }}>
                          {r.classification?.confidence_pct?.toFixed(1)}% confidence
                        </span>
                      </div>
                    </div>
                    <div>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-dim)', marginBottom: 4, letterSpacing: '0.08em' }}>SUBSTATION</div>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {r.localization?.substation_name ?? 'N/A'}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-dim)', marginBottom: 4, letterSpacing: '0.08em' }}>PIPELINE STAGES</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {r.pipeline_stages_run.map((s: string) => (
                          <span key={s} style={{
                            fontFamily: 'var(--font-mono)', fontSize: 8,
                            padding: '2px 6px', background: 'var(--accent-dim)',
                            border: '1px solid var(--border-dim)', borderRadius: 3, color: 'var(--accent-400)',
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
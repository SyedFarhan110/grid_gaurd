'use client';

import { useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { PipelineResult } from '@/lib/api';
import { useApp } from '@/lib/store';

type FaultStackProps = {
  moduleId: string;
  title: string;
  accentColor?: string;
  emptyMessage?: string;
};

function formatTimestamp(timestamp: string) {
  return new Date(timestamp).toLocaleString('en-GB', {
    dateStyle: 'short',
    timeStyle: 'medium',
  });
}

function getFaultLabel(result: PipelineResult) {
  return result.classification?.fault_type_label ?? (result.pipeline.fault_predicted ? 'Fault Detected' : 'Normal');
}

function getFaultLocation(result: PipelineResult) {
  if (result.localization?.substation_name) {
    return `${result.localization.substation_name} · ${result.localization.zone}`;
  }
  if (result.latent_alert?.notes) {
    return result.latent_alert.notes;
  }
  return 'Location not available';
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '4px 0' }}>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-dim)' }}>{label}</span>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-secondary)', textAlign: 'right' }}>{value}</span>
    </div>
  );
}

export default function FaultStack({ moduleId, title, accentColor = 'var(--alert-500)', emptyMessage = 'No faults recorded yet.' }: FaultStackProps) {
  const { state } = useApp();
  const faults = state.faultStacks[moduleId] ?? [];
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const initializedRef = useRef(false);

  useEffect(() => {
    if (faults.length === 0) {
      initializedRef.current = false;
      setExpandedId(null);
      return;
    }

    const expandedExists = expandedId ? faults.some(fault => fault.id === expandedId) : false;
    if (!initializedRef.current) {
      initializedRef.current = true;
      setExpandedId(faults[0].id);
      return;
    }

    if (expandedId && !expandedExists) {
      setExpandedId(faults[0].id);
    }
  }, [faults, expandedId]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-secondary)', letterSpacing: '0.06em' }}>
          {title}
        </div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-dim)' }}>
          {faults.length} saved
        </div>
      </div>

      {faults.length === 0 ? (
        <div style={{
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 8,
          padding: '12px 14px',
          fontFamily: 'var(--font-mono)',
          fontSize: 10,
          color: 'var(--text-dim)',
        }}>
          {emptyMessage}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {faults.map((fault, index) => {
            const isOpen = expandedId === fault.id;
            const riskColor = fault.pipeline.risk_level === 'CRITICAL'
              ? 'var(--alert-500)'
              : fault.pipeline.risk_level === 'HIGH'
                ? '#FF8C42'
                : fault.pipeline.risk_level === 'MEDIUM'
                  ? 'var(--warn-500)'
                  : 'var(--normal-500)';

            return (
              <div key={fault.id} style={{ marginTop: index === 0 ? 0 : 10 }}>
                <button
                  type="button"
                  onClick={() => setExpandedId(isOpen ? null : fault.id)}
                  aria-expanded={isOpen}
                  style={{
                    width: '100%',
                    textAlign: 'left',
                    background: isOpen ? 'var(--bg-card)' : 'var(--bg-elevated)',
                    border: `1px solid ${isOpen ? accentColor : 'var(--border-subtle)'}`,
                    borderLeft: `3px solid ${riskColor}`,
                    borderRadius: 8,
                    padding: '12px 14px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'flex-start',
                    justifyContent: 'space-between',
                    gap: 12,
                  }}
                >
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: accentColor, letterSpacing: '0.06em' }}>
                        {getFaultLabel(fault)}
                      </span>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-dim)' }}>
                        {formatTimestamp(fault.timestamp)}
                      </span>
                    </div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                      {getFaultLocation(fault)}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                    <span style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 800, color: riskColor }}>
                      {(fault.pipeline.fault_probability * 100).toFixed(1)}%
                    </span>
                    {isOpen ? <ChevronUp size={16} color="var(--text-secondary)" /> : <ChevronDown size={16} color="var(--text-secondary)" />}
                  </div>
                </button>

                {isOpen && (
                  <div style={{
                    marginTop: 8,
                    background: 'var(--bg-deep)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 8,
                    padding: 14,
                  }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 16 }}>
                      <div>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-dim)', marginBottom: 8 }}>Prediction</div>
                        <DetailRow label="Risk level" value={fault.pipeline.risk_level} />
                        <DetailRow label="Fault probability" value={`${(fault.pipeline.fault_probability * 100).toFixed(1)}%`} />
                        <DetailRow label="Confidence" value={`${fault.pipeline.confidence_pct}%`} />
                      </div>

                      <div>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-dim)', marginBottom: 8 }}>Location</div>
                        <DetailRow label="Substation" value={fault.localization?.substation_name ?? 'N/A'} />
                        <DetailRow label="Zone" value={fault.localization?.zone ?? 'N/A'} />
                        <DetailRow label="Distance" value={fault.localization ? `${fault.localization.distance_km} km` : 'N/A'} />
                      </div>

                      <div>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-dim)', marginBottom: 8 }}>Classification</div>
                        <DetailRow label="Type" value={fault.classification?.fault_type_label ?? 'N/A'} />
                        <DetailRow label="Code" value={fault.classification ? String(fault.classification.fault_type_code) : 'N/A'} />
                        <DetailRow label="Confidence" value={fault.classification ? `${fault.classification.confidence_pct}%` : 'N/A'} />
                      </div>

                      <div>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-dim)', marginBottom: 8 }}>Recovery</div>
                        <DetailRow label="Estimate" value={fault.etr?.estimated_recovery ?? 'N/A'} />
                        <DetailRow label="Range" value={fault.etr ? `${fault.etr.min_hours}h - ${fault.etr.max_hours}h` : 'N/A'} />
                        <DetailRow label="Model source" value={fault.etr?.source ?? 'N/A'} />
                      </div>
                    </div>

                    <div style={{ marginTop: 14 }}>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-dim)', marginBottom: 8 }}>Latent Alert</div>
                      <DetailRow label="Alert type" value={fault.latent_alert.alert_type} />
                      <DetailRow label="Probability" value={`${(fault.latent_alert.anomaly_probability * 100).toFixed(1)}%`} />
                      <div style={{ marginTop: 4, fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                        {fault.latent_alert.notes}
                      </div>
                    </div>

                    <div style={{ marginTop: 14 }}>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-dim)', marginBottom: 8 }}>Pipeline Stages</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                        {fault.pipeline_stages_run.map(stage => (
                          <span
                            key={stage}
                            style={{
                              padding: '4px 8px',
                              borderRadius: 4,
                              background: 'var(--bg-elevated)',
                              border: '1px solid var(--border-dim)',
                              fontFamily: 'var(--font-mono)',
                              fontSize: 9,
                              color: 'var(--text-secondary)',
                            }}
                          >
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
      )}
    </div>
  );
}
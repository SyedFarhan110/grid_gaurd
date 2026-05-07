'use client';
import { useApp } from '@/lib/store';
import { MapPin, Navigation, Layers } from 'lucide-react';
import dynamic from 'next/dynamic';

const KarachiMap = dynamic(() => import('@/components/KarachiMap'), {
  ssr: false,
  loading: () => (
    <div style={{ height: '100%', background: 'var(--bg-card)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-dim)' }}>Loading map...</span>
    </div>
  ),
});

export default function Localization() {
  const { state } = useApp();
  const result = state.stickyFaultResult ?? state.latestResult;
  const loc    = result?.localization;

  if (!result || !loc) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300 }}>
          <div style={{ textAlign: 'center' }}>
            <MapPin size={32} color="var(--text-dim)" style={{ margin: '0 auto 12px' }} />
            <p style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-dim)' }}>
              Localization runs after fault is detected
            </p>
          </div>
        </div>
      </div>
    );
  }

  const nearbySubstations = [
    { name: 'Garden Substation',        dist: 1.2, feeder: 'F-04', region: 'Central' },
    { name: 'Saddar Substation',        dist: 2.8, feeder: 'F-07', region: 'Central' },
    { name: 'Soldier Bazaar Substation',dist: 3.4, feeder: 'F-12', region: 'Central' },
    { name: 'Numaish Substation',       dist: 4.1, feeder: 'F-03', region: 'West'    },
    { name: 'PECHS Substation',         dist: 4.7, feeder: 'F-09', region: 'South'   },
  ].filter(s => s.name !== loc.substation_name).slice(0, 4);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* Header */}
      <div>
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
          Fault Localization
        </h2>
        <p style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-dim)', margin: '4px 0 0', letterSpacing: '0.06em' }}>
          Random Forest Classifier · 11 engineered features · 30 K-Electric zones
        </p>
      </div>

      {/* Result summary bar - RESPONSIVE */}
      <div style={{
        background: 'var(--alert-dim)', border: '1px solid var(--alert-500)',
        borderRadius: 8, padding: '14px 16px',
        display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12,
      }}>
        <MapPin size={20} color="var(--alert-500)" style={{ flexShrink: 0 }} />
        <div style={{ flex: '1 1 200px', minWidth: 0 }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 800, color: 'var(--alert-500)' }}>
            {loc.substation_name}
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-secondary)', marginTop: 2, wordBreak: 'break-word' }}>
            Zone: {loc.zone} · Distance from source: {loc.distance_km} km
            {loc.distance_source === 'estimated' && ' (estimated)'}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 16, marginLeft: 'auto', flexWrap: 'wrap' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 800, color: 'var(--alert-500)' }}>{loc.distance_km}</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-dim)', letterSpacing: '0.08em', whiteSpace: 'nowrap' }}>KM DIST</div>
          </div>
          <div style={{ width: 1, background: 'var(--border-subtle)', display: window.innerWidth < 640 ? 'none' : 'block' }} />
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 800, color: 'var(--accent-400)' }}>{loc.substation_id}</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-dim)', letterSpacing: '0.08em', whiteSpace: 'nowrap' }}>ZONE ID</div>
          </div>
        </div>
      </div>

      {/* Map + sidebar - RESPONSIVE GRID */}
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: window.innerWidth < 1024 ? '1fr' : '1fr 280px', 
        gap: 16, 
        minHeight: 420 
      }}>

        {/* Full map */}
        <div style={{ 
          background: 'var(--bg-card)', 
          border: '1px solid var(--border-subtle)', 
          borderRadius: 8, 
          overflow: 'hidden',
          height: window.innerWidth < 1024 ? 300 : 420
        }}>
          <KarachiMap faultZone={loc.substation_name} faultDistance={loc.distance_km} />
        </div>

        {/* Nearby substations - RESPONSIVE */}
        <div style={{ display: 'flex', flexDirection: window.innerWidth < 1024 ? 'row' : 'column', gap: 10, flexWrap: 'wrap' }}>
          <div style={{ 
            background: 'var(--bg-card)', 
            border: '1px solid var(--border-subtle)', 
            borderRadius: 8, 
            padding: 14,
            flex: window.innerWidth < 1024 ? '1 1 calc(50% - 5px)' : '1',
            minWidth: window.innerWidth < 640 ? '100%' : 'auto'
          }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-secondary)', marginBottom: 12, letterSpacing: '0.06em', display: 'flex', alignItems: 'center', gap: 6 }}>
              <Layers size={11} />  NEARBY SUBSTATIONS
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {nearbySubstations.map((sub, i) => (
                <div key={sub.name} style={{
                  background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)',
                  borderRadius: 6, padding: '10px 12px',
                  cursor: 'pointer',
                  transition: 'border-color 0.15s',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4, flexWrap: 'wrap', gap: 4 }}>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-primary)' }}>
                      {sub.name.replace(' Substation', '')}
                    </span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--warn-500)' }}>{sub.dist} km</span>
                  </div>
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-dim)' }}>Feeder: {sub.feeder}</span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-dim)' }}>·</span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-dim)' }}>{sub.region}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Legend - RESPONSIVE */}
          <div style={{ 
            background: 'var(--bg-card)', 
            border: '1px solid var(--border-subtle)', 
            borderRadius: 8, 
            padding: 14,
            flex: window.innerWidth < 1024 ? '1 1 calc(50% - 5px)' : '0',
            minWidth: window.innerWidth < 640 ? '100%' : 'auto'
          }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-secondary)', marginBottom: 10, letterSpacing: '0.06em' }}>MAP LEGEND</div>
            {[
              { color: '#FF3B5C', label: 'Fault Location' },
              { color: '#FFAA00', label: 'Nearby Substations' },
              { color: '#2E4560', label: 'Other Substations' },
            ].map(item => (
              <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <div style={{ width: 10, height: 10, borderRadius: '50%', background: item.color, boxShadow: `0 0 6px ${item.color}`, flexShrink: 0 }} />
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-secondary)' }}>{item.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Input features used - RESPONSIVE */}
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: 8, padding: 14 }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-secondary)', marginBottom: 12, letterSpacing: '0.06em' }}>
          LOCALIZATION FEATURES USED
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {['V1','V2','V3','I1','I2','I3','V_ratio','I_ratio','V_drop','Z_apparent','I_avg'].map(f => (
            <div key={f} style={{
              padding: '4px 10px',
              background: 'var(--bg-elevated)', border: '1px solid var(--border-dim)',
              borderRadius: 4, fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--accent-400)',
            }}>
              {f}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
'use client';
import { useState } from 'react';
import { useApp } from '@/lib/store';
import {
  LayoutDashboard, Zap, Tag, MapPin, Clock,
  CloudRain, AlertTriangle, History, Settings, Radio, Menu, X,
} from 'lucide-react';

const MODULES = [
  { id: 'dashboard',        label: 'Dashboard',        icon: LayoutDashboard, alwaysOn: true  },
  { id: 'fault-prediction', label: 'Fault Prediction', icon: Zap,             alwaysOn: false },
  { id: 'classification',   label: 'Classification',   icon: Tag,             alwaysOn: false },
  { id: 'localization',     label: 'Localization',     icon: MapPin,          alwaysOn: false },
  { id: 'etr',              label: 'ETR / Recovery',   icon: Clock,           alwaysOn: false },
  { id: 'weather',          label: 'Weather Analysis', icon: CloudRain,       alwaysOn: true  },
  { id: 'anomaly',          label: 'Anomaly Insights', icon: AlertTriangle,   alwaysOn: true  },
  { id: 'history',          label: 'History',          icon: History,         alwaysOn: true  },
];

export default function Sidebar() {
  const { state, dispatch } = useApp();
  const isFault = state.faultState === 'alert';
  const [mobileOpen, setMobileOpen] = useState(false);

  const navContent = (
    <>
      {/* Logo */}
      <div style={{ padding: '24px 20px 20px', borderBottom: '1px solid var(--border-subtle)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 32, height: 32,
              background: 'linear-gradient(135deg, var(--accent-500), var(--normal-500))',
              borderRadius: 6,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}>
              <Radio size={16} color="#fff" />
            </div>
            <div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
                GridGuard
              </div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-dim)', letterSpacing: '0.1em' }}>
                AI • K-ELECTRIC
              </div>
            </div>
          </div>

          {/* Close button — mobile only */}
          <button
            onClick={() => setMobileOpen(false)}
            className="sidebar-close-btn"
            style={{
              display: 'none', // shown via media query class
              background: 'none', border: 'none', cursor: 'pointer', padding: 4,
            }}
          >
            <X size={18} color="var(--text-secondary)" />
          </button>
        </div>

        {/* Live status pill */}
        <div style={{
          marginTop: 14,
          padding: '5px 10px',
          background: isFault ? 'var(--alert-dim)' : 'var(--normal-dim)',
          border: `1px solid ${isFault ? 'var(--alert-500)' : 'var(--normal-500)'}`,
          borderRadius: 20,
          display: 'flex', alignItems: 'center', gap: 6,
        }}>
          <span
            className={isFault ? 'blink' : ''}
            style={{
              width: 6, height: 6, borderRadius: '50%',
              background: isFault ? 'var(--alert-500)' : 'var(--normal-500)',
              display: 'block',
              boxShadow: `0 0 6px ${isFault ? 'var(--alert-500)' : 'var(--normal-500)'}`,
            }}
          />
          <span style={{
            fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.08em',
            color: isFault ? 'var(--alert-500)' : 'var(--normal-500)',
          }}>
            {isFault ? 'FAULT ALERT' : 'MONITORING'}
          </span>
        </div>
      </div>

      {/* Nav items */}
      <nav style={{ flex: 1, padding: '12px 0', overflowY: 'auto' }}>
        {MODULES.map(mod => {
          const isActive  = state.activeModule === mod.id;
          const isEnabled = mod.alwaysOn || isFault || state.faultModulesUnlocked;
          const Icon      = mod.icon;

          return (
            <button
              key={mod.id}
              disabled={!isEnabled}
              onClick={() => {
                if (isEnabled) {
                  dispatch({ type: 'SET_MODULE', payload: mod.id });
                  setMobileOpen(false); // close drawer on mobile after selection
                }
              }}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '10px 20px',
                background: isActive ? 'rgba(14,165,233,0.08)' : 'transparent',
                border: 'none',
                borderLeft: isActive ? '2px solid var(--accent-500)' : '2px solid transparent',
                cursor: isEnabled ? 'pointer' : 'not-allowed',
                opacity: isEnabled ? 1 : 0.3,
                transition: 'all 0.15s ease',
                textAlign: 'left',
              }}
            >
              <Icon
                size={15}
                color={isActive ? 'var(--accent-400)' : isEnabled ? 'var(--text-secondary)' : 'var(--text-dim)'}
              />
              <span style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 11,
                letterSpacing: '0.04em',
                color: isActive ? 'var(--accent-400)' : isEnabled ? 'var(--text-secondary)' : 'var(--text-dim)',
                fontWeight: isActive ? 700 : 400,
              }}>
                {mod.label}
              </span>
              {mod.id === 'fault-prediction' && isFault && (
                <span className="blink" style={{
                  marginLeft: 'auto',
                  width: 6, height: 6, borderRadius: '50%',
                  background: 'var(--alert-500)',
                  display: 'block',
                  boxShadow: '0 0 6px var(--alert-500)',
                }} />
              )}
            </button>
          );
        })}
      </nav>

      {/* Footer */}
      <div style={{
        padding: '16px 20px',
        borderTop: '1px solid var(--border-subtle)',
        display: 'flex', alignItems: 'center', gap: 8,
      }}>
        <Settings size={13} color="var(--text-dim)" />
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-dim)' }}>
          v1.0.0 • FYDP 2025
        </span>
      </div>
    </>
  );

  return (
    <>
      {/* ── Hamburger trigger (mobile only) ── */}
      <button
        onClick={() => setMobileOpen(true)}
        aria-label="Open menu"
        style={{
          display: 'none',            // shown via CSS below
          position: 'fixed',
          top: 12, left: 12,
          zIndex: 200,
          background: 'var(--bg-deep)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 6,
          padding: '6px 8px',
          cursor: 'pointer',
          alignItems: 'center', justifyContent: 'center',
        }}
        className="sidebar-hamburger"
      >
        <Menu size={18} color="var(--text-secondary)" />
      </button>

      {/* ── Mobile backdrop overlay ── */}
      {mobileOpen && (
        <div
          onClick={() => setMobileOpen(false)}
          className="sidebar-backdrop"
          style={{
            position: 'fixed', inset: 0,
            background: 'rgba(0,0,0,0.55)',
            zIndex: 149,
          }}
        />
      )}

      {/* ── Sidebar panel ── */}
      <aside
        className={`sidebar-panel${mobileOpen ? ' sidebar-open' : ''}`}
        style={{
          width: 220,
          minWidth: 220,
          background: 'var(--bg-deep)',
          borderRight: '1px solid var(--border-subtle)',
          display: 'flex',
          flexDirection: 'column',
          height: '100vh',
          position: 'sticky',
          top: 0,
          zIndex: 150,
        }}
      >
        {navContent}
      </aside>

      {/* ── Scoped responsive styles ── */}
      <style>{`
        @media (max-width: 768px) {
          .sidebar-hamburger {
            display: flex !important;
          }
          .sidebar-close-btn {
            display: flex !important;
          }
          .sidebar-panel {
            position: fixed !important;
            top: 0;
            left: 0;
            height: 100vh !important;
            transform: translateX(-100%);
            transition: transform 0.25s ease;
            box-shadow: 4px 0 24px rgba(0,0,0,0.4);
          }
          .sidebar-panel.sidebar-open {
            transform: translateX(0);
          }
        }
      `}</style>
    </>
  );
}
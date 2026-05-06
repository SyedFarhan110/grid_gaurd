'use client';
import { useApp } from '@/lib/store';
import Sidebar from '@/components/Sidebar';
import Header  from '@/components/Header';
import Dashboard from '@/components/Dashboard';
import FaultPrediction  from '@/components/modules/FaultPrediction';
import Classification   from '@/components/modules/Classification';
import Localization     from '@/components/modules/Localization';
import ETR              from '@/components/modules/ETR';
import WeatherAnalysis  from '@/components/modules/WeatherAnalysis';
import AnomalyInsights  from '@/components/modules/AnomalyInsights';
import HistoryModule    from '@/components/modules/HistoryModule';

function ModuleRenderer() {
  const { state } = useApp();
  switch (state.activeModule) {
    case 'dashboard':        return <Dashboard />;
    case 'fault-prediction': return <FaultPrediction />;
    case 'classification':   return <Classification />;
    case 'localization':     return <Localization />;
    case 'etr':              return <ETR />;
    case 'weather':          return <WeatherAnalysis />;
    case 'anomaly':          return <AnomalyInsights />;
    case 'history':          return <HistoryModule />;
    default:                 return <Dashboard />;
  }
}

export default function Page() {
  const { state } = useApp();
  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: 'var(--bg-void)' }}>
      <Sidebar />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <Header />
        <main style={{
          flex: 1, overflowY: 'auto', padding: '20px 24px',
          background: state.faultState === 'alert'
            ? 'radial-gradient(ellipse 80% 40% at 50% 0%, rgba(255,59,92,0.04) 0%, transparent 60%)'
            : 'var(--bg-void)',
        }}>
          <ModuleRenderer />
        </main>
      </div>
    </div>
  );
}

'use client';
import React, { createContext, useContext, useReducer, useCallback, useRef } from 'react';
import { api, PipelineResult, ModelStatus, ResultsSummary } from '@/lib/api';

// ── Demo Results (offline demo data) ────────────────────────────────────────────
function createDemoResult(isFault: boolean): PipelineResult {
  return {
    id: `demo-${Date.now()}`,
    timestamp: new Date().toISOString(),
    pipeline: {
      fault_predicted: isFault,
      fault_probability: isFault ? 0.82 : 0.12,
      confidence_pct: isFault ? 94 : 97,
      risk_level: isFault ? 'CRITICAL' : 'LOW',
    },
    latent_alert: {
      anomaly_detected: isFault,
      anomaly_probability: isFault ? 0.68 : 0.15,
      alert_type: isFault ? 'ANOMALY' : 'NORMAL',
      notes: isFault
        ? 'High current imbalance detected. Potential feeder fault imminent.'
        : 'All parameters within normal operating range.',
    },
    classification: isFault ? {
      fault_type_code: 3,
      fault_type_label: 'Single-Line-to-Ground (SLG)',
      confidence_pct: 87,
      all_probabilities: { SLG: 0.87, DLG: 0.08, LL: 0.05 },
    } : undefined,
    localization: isFault ? {
      substation_id: 5,
      substation_name: 'North Karachi SS',
      distance_km: 8.3,
      zone: 'Zone F1 - Feeder 3',
      distance_source: 'Voltage profile analysis',
    } : undefined,
    etr: isFault ? {
      fault_type: 'SLG',
      typical_hours: 2.5,
      min_hours: 1.5,
      max_hours: 4.0,
      estimated_recovery: '~2.5 hrs',
    } : undefined,
    pipeline_stages_run: isFault
      ? ['fault_prediction', 'classification', 'localization', 'etr', 'latent_alert']
      : ['fault_prediction', 'latent_alert'],
  };
}

// ── Demo payload (used when backend is offline) ────────────────────────────────
export const DEMO_NORMAL_PAYLOAD = {
  fault_prediction: {
    KW_Plus: 3800, Avg_Current: 140, Average_PF: 0.91, Avg_Voltage: 222,
    I_imbalance: 0.04, V_imbalance: 0.02, current_magnitude: 242, zero_seq: 0.1,
    I_imbalance_diff: 0.001, hour: 10, dayofweek: 1, is_night: 0,
  },
  latent_alert: {
    feeder_load: 8.2, hour: 10, month: 5, dayofweek: 1,
    temperature: 32, humidity: 55, wind_speed: 8, precipitation: 0,
    is_rain: 0, is_weekend: 0, is_peak_hour: 0, is_night: 0,
    season: 'spring', temp_bucket: 'warm', baseline_mean: 8.5, baseline_std: 0.8,
  },
};

export const DEMO_FAULT_PAYLOAD = {
  fault_prediction: {
    KW_Plus: 4800, Avg_Current: 185, Average_PF: 0.78, Avg_Voltage: 208,
    I_imbalance: 0.22, V_imbalance: 0.15, current_magnitude: 320, zero_seq: 3.2,
    I_imbalance_diff: 0.08, hour: 14, dayofweek: 2, is_night: 0,
    I_imbalance_rmean_4: 0.18, I_imbalance_rstd_4: 0.04, curr_mag_rmean_4: 310,
    I_imbalance_rmean_8: 0.16, I_imbalance_rstd_8: 0.05, curr_mag_rmean_8: 300,
    I_imbalance_rmean_12: 0.14, I_imbalance_rstd_12: 0.045, curr_mag_rmean_12: 295,
    I_lag_1: 0.20, curr_lag_1: 315, I_lag_2: 0.19, curr_lag_2: 312,
    I_lag_3: 0.18, curr_lag_3: 308, I_lag_4: 0.17, curr_lag_4: 305,
    I_lag_8: 0.15, curr_lag_8: 298,
  },
  latent_alert: {
    feeder_load: 19.2, hour: 14, month: 7, dayofweek: 2,
    temperature: 44, humidity: 78, wind_speed: 3, precipitation: 0,
    is_rain: 0, is_weekend: 0, is_peak_hour: 1, is_night: 0,
    season: 'summer', temp_bucket: 'extreme', baseline_mean: 10.5, baseline_std: 1.2,
  },
  fault_classification: { Ia: -151.29, Ib: -9.68, Ic: 85.80, Va: 0.40, Vb: -0.13, Vc: -0.27 },
  localization: { V1: 33.188, V2: 33.993, V3: 33.500, I1: 120.5, I2: 118.2, I3: 121.0 },
};

// ── Live chart data ────────────────────────────────────────────────────────────
export interface LiveReading {
  time: string;
  voltage: number;
  current: number;
  power_factor: number;
  load: number;
}

// ── State ──────────────────────────────────────────────────────────────────────
interface AppState {
  activeModule: string;
  faultState: 'normal' | 'alert';
  latestResult: PipelineResult | null;
  history: PipelineResult[];
  modelStatus: ModelStatus | null;
  summary: ResultsSummary | null;
  liveReadings: LiveReading[];
  loading: boolean;
  error: string | null;
  lastPollTime: string | null;
  weatherData: { temp: number; humidity: number; wind: number; rain: number; condition: string };
}

type Action =
  | { type: 'SET_MODULE'; payload: string }
  | { type: 'SET_RESULT'; payload: PipelineResult }
  | { type: 'SET_HISTORY'; payload: PipelineResult[] }
  | { type: 'SET_MODEL_STATUS'; payload: ModelStatus }
  | { type: 'SET_SUMMARY'; payload: ResultsSummary }
  | { type: 'ADD_LIVE_READING'; payload: LiveReading }
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_ERROR'; payload: string | null }
  | { type: 'SET_POLL_TIME'; payload: string }
  | { type: 'SET_WEATHER'; payload: AppState['weatherData'] };

function generateLiveReading(base: Partial<LiveReading> = {}): LiveReading {
  const now = new Date();
  return {
    time: now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    voltage:      220 + (Math.random() - 0.5) * 12,
    current:      145 + (Math.random() - 0.5) * 20,
    power_factor: 0.88 + (Math.random() - 0.5) * 0.06,
    load:         8.5  + (Math.random() - 0.5) * 2,
    ...base,
  };
}

function initLiveReadings(): LiveReading[] {
  const readings: LiveReading[] = [];
  const now = Date.now();
  for (let i = 29; i >= 0; i--) {
    const t = new Date(now - i * 10000);
    readings.push({
      time: t.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      voltage:      220 + (Math.random() - 0.5) * 10,
      current:      145 + (Math.random() - 0.5) * 18,
      power_factor: 0.88 + (Math.random() - 0.5) * 0.05,
      load:         8.5  + (Math.random() - 0.5) * 1.5,
    });
  }
  return readings;
}

const initialState: AppState = {
  activeModule:  'dashboard',
  faultState:    'normal',
  latestResult:  null,
  history:       [],
  modelStatus:   null,
  summary:       null,
  liveReadings:  initLiveReadings(),
  loading:       false,
  error:         null,
  lastPollTime:  null,
  weatherData:   { temp: 36, humidity: 62, wind: 12, rain: 0, condition: 'Clear' },
};

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'SET_MODULE':       return { ...state, activeModule: action.payload };
    case 'SET_RESULT':       return { ...state, latestResult: action.payload, faultState: action.payload.pipeline.fault_predicted ? 'alert' : 'normal' };
    case 'SET_HISTORY':      return { ...state, history: action.payload };
    case 'SET_MODEL_STATUS': return { ...state, modelStatus: action.payload };
    case 'SET_SUMMARY':      return { ...state, summary: action.payload };
    case 'SET_LOADING':      return { ...state, loading: action.payload };
    case 'SET_ERROR':        return { ...state, error: action.payload };
    case 'SET_POLL_TIME':    return { ...state, lastPollTime: action.payload };
    case 'SET_WEATHER':      return { ...state, weatherData: action.payload };
    case 'ADD_LIVE_READING': {
      const readings = [...state.liveReadings, action.payload];
      return { ...state, liveReadings: readings.slice(-60) };
    }
    default: return state;
  }
}

// ── Context ────────────────────────────────────────────────────────────────────
interface AppContextValue {
  state: AppState;
  dispatch: React.Dispatch<Action>;
  runPipeline: (payload?: object) => Promise<void>;
  triggerFaultDemo: () => Promise<void>;
  triggerNormalDemo: () => Promise<void>;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Live readings ticker
  React.useEffect(() => {
    const tick = setInterval(() => {
      dispatch({ type: 'ADD_LIVE_READING', payload: generateLiveReading() });
    }, 3000);
    return () => clearInterval(tick);
  }, []);

  // Load model status on mount
  React.useEffect(() => {
    api.modelStatus().then(s => dispatch({ type: 'SET_MODEL_STATUS', payload: s })).catch(() => {});
    api.summary().then(s => dispatch({ type: 'SET_SUMMARY', payload: s })).catch(() => {});
    api.results(20).then(r => dispatch({ type: 'SET_HISTORY', payload: r.results })).catch(() => {});
  }, []);

  const runPipeline = useCallback(async (payload?: object) => {
    dispatch({ type: 'SET_LOADING', payload: true });
    dispatch({ type: 'SET_ERROR', payload: null });
    try {
      const body = payload || DEMO_NORMAL_PAYLOAD;
      const result = await api.pipeline(body as any);
      dispatch({ type: 'SET_RESULT', payload: result });
      dispatch({ type: 'SET_POLL_TIME', payload: new Date().toLocaleTimeString() });
      // Refresh summary
      api.summary().then(s => dispatch({ type: 'SET_SUMMARY', payload: s })).catch(() => {});
      api.results(20).then(r => dispatch({ type: 'SET_HISTORY', payload: r.results })).catch(() => {});
    } catch (e: any) {
      console.error('API failed:', e.message);
      // Fallback to demo result if backend fails
      const isFault = (payload as any)?.fault_prediction?.I_imbalance > 0.15;
      const result = createDemoResult(isFault);
      dispatch({ type: 'SET_RESULT', payload: result });
      dispatch({ type: 'SET_POLL_TIME', payload: new Date().toLocaleTimeString() });
      dispatch({ type: 'SET_ERROR', payload: `API error: ${e.message}. Using demo data.` });
    } finally {
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  }, []);

  const triggerFaultDemo  = useCallback(() => runPipeline(DEMO_FAULT_PAYLOAD), [runPipeline]);
  const triggerNormalDemo = useCallback(() => runPipeline(DEMO_NORMAL_PAYLOAD), [runPipeline]);

  return (
    <AppContext.Provider value={{ state, dispatch, runPipeline, triggerFaultDemo, triggerNormalDemo }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}

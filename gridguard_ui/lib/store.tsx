'use client';
import React, { createContext, useContext, useReducer, useCallback, useRef } from 'react';
import { api, PipelineResult, ModelStatus, ResultsSummary } from '@/lib/api';
import { streamManager, StreamEvent } from '@/lib/streaming';

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
      fault_type_code: 0,
      fault_type_label: 'LG',
      confidence_pct: 87,
      all_probabilities: { LG: 87, LL: 5, LLG: 4, LLL: 2, LLLG: 1, 'No Fault': 1 },
    } : undefined,
    localization: isFault ? {
      substation_id: 5,
      substation_name: 'North Karachi SS',
      distance_km: 8.3,
      zone: 'Zone F1 - Feeder 3',
      distance_source: 'Voltage profile analysis',
    } : undefined,
    etr: isFault ? {
      fault_type: 'LG',
      typical_hours: 2.5,
      min_hours: 1.5,
      max_hours: 4.0,
      estimated_recovery: '~2.5 hrs',
      source: 'lookup_table',
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
    feeder_load: 10.0722, hour: 1, month: 11, dayofweek: 2,
    temperature: 24.7, humidity: 64.2, wind_speed: 11.1, precipitation: 0,
    is_rain: 0, is_weekend: 0, is_peak_hour: 0,
    season: 'autumn', temp_bucket: 'mild',
    baseline_mean: 6.856, baseline_std: 3.939,
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
    feeder_load: 9.3979, hour: 2, month: 11, dayofweek: 2,
    temperature: 21.7, humidity: 65.6, wind_speed: 9.1, precipitation: 0,
    is_rain: 0, is_weekend: 0, is_peak_hour: 0,
    season: 'autumn', temp_bucket: 'cool',
    baseline_mean: 2.984, baseline_std: 2.003,
  },
  fault_classification: { Ia: -151.2918, Ib: -9.6775, Ic: 85.8002, Va: 0.4007, Vb: -0.1329, Vc: -0.2678 },
  localization: { V1: 33.188, V2: 33.993, V3: 33.500, I1: 11.3651, I2: 0.5738, I3: 0.5976 },
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
  faultModulesUnlocked: boolean;
  latestResult: PipelineResult | null;
  stickyFaultResult: PipelineResult | null;
  faultStacks: Record<string, PipelineResult[]>;
  history: PipelineResult[];
  modelStatus: ModelStatus | null;
  summary: ResultsSummary | null;
  liveReadings: LiveReading[];
  loading: boolean;
  error: string | null;
  lastPollTime: string | null;
  weatherData: { temp: number; humidity: number; wind: number; rain: number; condition: string };
  streamConnected: boolean;
  streamError: string | null;
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
  | { type: 'SET_WEATHER'; payload: AppState['weatherData'] }
  | { type: 'SET_STREAM_CONNECTED'; payload: boolean }
  | { type: 'SET_STREAM_ERROR'; payload: string | null }
  | { type: 'STREAM_EVENT'; payload: StreamEvent };

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
  for (let i = 29; i >= 0; i--) {
    const minutesAgo = i;
    readings.push({
      time: `${String(12 + Math.floor(minutesAgo / 60)).padStart(2, '0')}:${String(minutesAgo % 60).padStart(2, '0')}:00`,
      voltage:      220 + ((i % 5) - 2) * 1.2,
      current:      145 + ((i % 7) - 3) * 1.1,
      power_factor: 0.88 + ((i % 4) - 1.5) * 0.005,
      load:         8.5  + ((i % 6) - 2.5) * 0.12,
    });
  }
  return readings;
}

const FAULT_STACK_MODULES = ['dashboard', 'fault-prediction', 'classification', 'localization', 'etr', 'anomaly'];

function pushFaultToStacks(stacks: Record<string, PipelineResult[]>, result: PipelineResult): Record<string, PipelineResult[]> {
  const nextStacks: Record<string, PipelineResult[]> = { ...stacks };
  for (const moduleId of FAULT_STACK_MODULES) {
    const moduleStack = nextStacks[moduleId] ?? [];
    if (moduleStack[0]?.id === result.id) {
      continue;
    }
    nextStacks[moduleId] = [result, ...moduleStack.filter(item => item.id !== result.id)].slice(0, 10);
  }
  return nextStacks;
}

const initialState: AppState = {
  activeModule:  'dashboard',
  faultState:    'normal',
  latestResult:  null,
  stickyFaultResult: null,
  faultStacks:   {},
  history:       [],
  modelStatus:   null,
  summary:       null,
  liveReadings:  initLiveReadings(),
  loading:       false,
  error:         null,
  lastPollTime:  null,
  weatherData:   { temp: 36, humidity: 62, wind: 12, rain: 0, condition: 'Clear' },
  streamConnected: false,
  streamError:   null,
  faultModulesUnlocked: false,
};

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'SET_MODULE':       return { ...state, activeModule: action.payload };
    case 'SET_RESULT': {
      const isFault = action.payload.pipeline.fault_predicted;
      return {
        ...state,
        latestResult: action.payload,
        stickyFaultResult: isFault ? action.payload : state.stickyFaultResult,
        faultState: isFault ? 'alert' : 'normal',
        faultModulesUnlocked: isFault || state.faultModulesUnlocked,
        faultStacks: isFault ? pushFaultToStacks(state.faultStacks, action.payload) : state.faultStacks,
      };
    }
    case 'SET_HISTORY':      return { ...state, history: action.payload };
    case 'SET_MODEL_STATUS': return { ...state, modelStatus: action.payload };
    case 'SET_SUMMARY':      return { ...state, summary: action.payload };
    case 'SET_LOADING':      return { ...state, loading: action.payload };
    case 'SET_ERROR':        return { ...state, error: action.payload };
    case 'SET_POLL_TIME':    return { ...state, lastPollTime: action.payload };
    case 'SET_WEATHER':      return { ...state, weatherData: action.payload };
    case 'SET_STREAM_CONNECTED': return { ...state, streamConnected: action.payload };
    case 'SET_STREAM_ERROR': return { ...state, streamError: action.payload };
    case 'ADD_LIVE_READING': {
      const readings = [...state.liveReadings, action.payload];
      return { ...state, liveReadings: readings.slice(-60) };
    }
    case 'STREAM_EVENT': {
      const event = action.payload;
      const result = event.pipeline_result ?? (event as any).prediction;
      const timestamp = event.timestamp || new Date().toISOString();
      if (!result?.pipeline) {
        return {
          ...state,
          streamError: 'Received stream event without prediction data',
        };
      }
      const readings = [...state.liveReadings];
      
      // Add live reading from raw data if available
      if (event.raw_data) {
        readings.push({
          time: new Date(timestamp).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
          voltage: event.raw_data.Avg_Voltage || 220,
          current: event.raw_data.Avg_Current || 145,
          power_factor: event.raw_data.Average_PF || 0.88,
          load: event.raw_data.KW_Plus || 8.5,
        });
      }

      return {
        ...state,
        latestResult: result,
        stickyFaultResult: result.pipeline.fault_predicted ? result : state.stickyFaultResult,
        faultState: result.pipeline.fault_predicted ? 'alert' : 'normal',
        faultModulesUnlocked: state.faultModulesUnlocked || result.pipeline.fault_predicted,
        faultStacks: result.pipeline.fault_predicted ? pushFaultToStacks(state.faultStacks, result) : state.faultStacks,
        liveReadings: readings.slice(-60),
        lastPollTime: new Date(timestamp).toLocaleTimeString(),
        streamError: null,
      };
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
  const unsubscribeRef = useRef<(() => void) | null>(null);
  const errorUnsubscribeRef = useRef<(() => void) | null>(null);

  // Initialize streaming connection
  React.useEffect(() => {
    console.log('[AppProvider] Initializing streaming connection');
    
    // Connect to stream
    streamManager.connect()
      .then(() => {
        console.log('[AppProvider] Streaming connected');
        dispatch({ type: 'SET_STREAM_CONNECTED', payload: true });
        dispatch({ type: 'SET_STREAM_ERROR', payload: null });
      })
      .catch((err) => {
        console.error('[AppProvider] Failed to connect to stream:', err);
        dispatch({ type: 'SET_STREAM_ERROR', payload: err.message });
      });

    // Subscribe to stream events
    unsubscribeRef.current = streamManager.subscribe((event: StreamEvent) => {
      console.log('[AppProvider] Received stream event:', event.event_id);
      dispatch({ type: 'STREAM_EVENT', payload: event });
    });

    // Subscribe to errors
    errorUnsubscribeRef.current = streamManager.onError((error: Error) => {
      console.error('[AppProvider] Stream error:', error);
      dispatch({ type: 'SET_STREAM_ERROR', payload: error.message });
      // If stream disconnects, try reconnecting
      setTimeout(() => {
        streamManager.connect()
          .then(() => dispatch({ type: 'SET_STREAM_CONNECTED', payload: true }))
          .catch(() => dispatch({ type: 'SET_STREAM_CONNECTED', payload: false }));
      }, 5000);
    });

    return () => {
      if (unsubscribeRef.current) unsubscribeRef.current();
      if (errorUnsubscribeRef.current) errorUnsubscribeRef.current();
      streamManager.disconnect();
    };
  }, []);

  // Live readings ticker (fallback if streaming is not available)
  React.useEffect(() => {
    // Only generate live readings if not connected to stream
    if (!state.streamConnected) {
      const tick = setInterval(() => {
        dispatch({ type: 'ADD_LIVE_READING', payload: generateLiveReading() });
      }, 3000);
      return () => clearInterval(tick);
    }
  }, [state.streamConnected]);

  // Load model status on mount
  React.useEffect(() => {
    api.modelStatus().then(s => dispatch({ type: 'SET_MODEL_STATUS', payload: s })).catch(() => {});
    api.summary().then(s => dispatch({ type: 'SET_SUMMARY', payload: s })).catch(() => {});
    // Initial fetch — fault records only from Firestore
    api.results(100, true).then(r => dispatch({ type: 'SET_HISTORY', payload: r.results })).catch(() => {});

    // Auto-refresh history every 10 seconds to pick up new faults from Firestore
    const historyInterval = setInterval(() => {
      api.results(100, true).then(r => dispatch({ type: 'SET_HISTORY', payload: r.results })).catch(() => {});
      api.summary().then(s => dispatch({ type: 'SET_SUMMARY', payload: s })).catch(() => {});
    }, 10000);

    return () => clearInterval(historyInterval);
  }, []);

  const runPipeline = useCallback(async (payload?: object) => {
    dispatch({ type: 'SET_LOADING', payload: true });
    dispatch({ type: 'SET_ERROR', payload: null });
    try {
      const body = payload || DEMO_NORMAL_PAYLOAD;
      const result = await api.pipeline(body as any);
      dispatch({ type: 'SET_RESULT', payload: result });
      dispatch({ type: 'SET_POLL_TIME', payload: new Date().toLocaleTimeString() });
      // Refresh summary and history
      api.summary().then(s => dispatch({ type: 'SET_SUMMARY', payload: s })).catch(() => {});
      api.results(100, true).then(r => dispatch({ type: 'SET_HISTORY', payload: r.results })).catch(() => {});
    } catch (e: any) {
      console.error('API failed:', e.message);
      // Fallback to demo result if backend fails
      const isFault = (payload as any)?.fault_prediction?.I_imbalance > 0.15;
      const result = createDemoResult(isFault);
      dispatch({ type: 'SET_RESULT', payload: result });
      dispatch({ type: 'SET_POLL_TIME', payload: new Date().toLocaleTimeString() });
      dispatch({ type: 'SET_ERROR', payload: `API error: ${e.message}. Using demo data.` });
      // When backend is offline: prepend demo result to history (keep last 20)
      const demoHistory = [result, ...state.history].slice(0, 20);
      dispatch({ type: 'SET_HISTORY', payload: demoHistory });
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

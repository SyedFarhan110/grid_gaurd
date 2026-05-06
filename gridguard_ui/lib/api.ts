// lib/api.ts — All FastAPI backend calls

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export interface FaultPredictionInput {
  KW_Plus: number;
  Avg_Current: number;
  Average_PF: number;
  Avg_Voltage: number;
  I_imbalance: number;
  V_imbalance: number;
  current_magnitude: number;
  zero_seq: number;
  I_imbalance_diff: number;
  hour: number;
  dayofweek: number;
  is_night: number;
  I_imbalance_rmean_4?: number;
  I_imbalance_rstd_4?: number;
  curr_mag_rmean_4?: number;
  I_imbalance_rmean_8?: number;
  I_imbalance_rstd_8?: number;
  curr_mag_rmean_8?: number;
  I_imbalance_rmean_12?: number;
  I_imbalance_rstd_12?: number;
  curr_mag_rmean_12?: number;
  I_lag_1?: number; curr_lag_1?: number;
  I_lag_2?: number; curr_lag_2?: number;
  I_lag_3?: number; curr_lag_3?: number;
  I_lag_4?: number; curr_lag_4?: number;
  I_lag_8?: number; curr_lag_8?: number;
}

export interface FaultClassificationInput {
  Ia: number; Ib: number; Ic: number;
  Va: number; Vb: number; Vc: number;
}

export interface LocalizationInput {
  V1: number; V2: number; V3: number;
  I1: number; I2: number; I3: number;
}

export interface LatentAlertInput {
  feeder_load: number;
  hour: number;
  month: number;
  dayofweek: number;
  temperature: number;
  humidity: number;
  wind_speed?: number;
  precipitation?: number;
  is_rain?: number;
  is_weekend?: number;
  is_peak_hour?: number;
  is_night?: number;
  season?: string;
  temp_bucket?: string;
  baseline_mean?: number;
  baseline_std?: number;
}

export interface PipelineInput {
  fault_prediction: FaultPredictionInput;
  latent_alert: LatentAlertInput;
  fault_classification?: FaultClassificationInput;
  localization?: LocalizationInput;
}

export interface FaultPredictionResult {
  fault_predicted: boolean;
  fault_probability: number;
  confidence_pct: number;
  risk_level: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
}

export interface FaultClassificationResult {
  fault_type_code: number;
  fault_type_label: string;
  confidence_pct: number;
  all_probabilities: Record<string, number>;
}

export interface LocalizationResult {
  substation_id: number;
  substation_name: string;
  distance_km: number;
  zone: string;
  distance_source?: string;
}

export interface ETRResult {
  fault_type: string;
  typical_hours: number;
  min_hours: number;
  max_hours: number;
  estimated_recovery: string;
  source?: string;
}

export interface LatentAlertResult {
  anomaly_detected: boolean;
  anomaly_probability: number;
  alert_type: 'NORMAL' | 'SPIKE' | 'ANOMALY';
  notes: string;
}

export interface PipelineResult {
  id: string;
  timestamp: string;
  pipeline: FaultPredictionResult;
  classification?: FaultClassificationResult;
  localization?: LocalizationResult;
  etr?: ETRResult;
  latent_alert: LatentAlertResult;
  pipeline_stages_run: string[];
}

export interface ModelStatus {
  loaded: number;
  total: number;
  all_ready: boolean;
  models: Array<{ model_name: string; status: string; model_type: string; description: string }>;
}

export interface ResultsSummary {
  total_predictions: number;
  total_faults_predicted: number;
  total_latent_alerts: number;
  fault_rate_pct: number;
  alert_rate_pct: number;
}

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`API ${path} failed (${res.status}): ${err}`);
  }
  return res.json();
}

export const api = {
  health:       () => apiFetch<{ status: string; models_loaded: number; all_ready: boolean }>('/health'),
  modelStatus:  () => apiFetch<ModelStatus>('/models/status'),
  loadModels:   () => apiFetch<{ message: string }>('/models/load', { method: 'POST' }),

  pipeline:     (body: PipelineInput)              => apiFetch<PipelineResult>('/predict/pipeline', { method: 'POST', body: JSON.stringify(body) }),
  predictFault: (body: FaultPredictionInput)       => apiFetch<FaultPredictionResult>('/predict/fault', { method: 'POST', body: JSON.stringify(body) }),
  classify:     (body: FaultClassificationInput)   => apiFetch<FaultClassificationResult>('/predict/classify', { method: 'POST', body: JSON.stringify(body) }),
  localize:     (body: LocalizationInput)          => apiFetch<LocalizationResult>('/predict/localize', { method: 'POST', body: JSON.stringify(body) }),
  latentAlert:  (body: LatentAlertInput)           => apiFetch<LatentAlertResult>('/predict/latent-alert', { method: 'POST', body: JSON.stringify(body) }),

  results:      (limit = 50)  => apiFetch<{ count: number; results: PipelineResult[] }>(`/results/?limit=${limit}`),
  summary:      ()            => apiFetch<ResultsSummary>('/results/summary'),
  getResult:    (id: string)  => apiFetch<PipelineResult>(`/results/${id}`),
};

"""
Pydantic schemas for all API request and response models.
"""

from pydantic import BaseModel, Field, ConfigDict
from typing import Optional, Dict, Any, List
from datetime import datetime


# ══════════════════════════════════════════════════════════
# REQUEST SCHEMAS
# ══════════════════════════════════════════════════════════

class FaultPredictionInput(BaseModel):
    """
    Raw feeder sensor data for fault prediction.
    Required: 31 features used by XGBoost model.
    Optional raw phase data will be used to compute derived features.
    """
    # Core electrical readings
    KW_Plus:           float = Field(..., description="Active power (kW)", example=4237.1)
    Avg_Current:       float = Field(..., description="Average current (A)", example=152.3)
    Average_PF:        float = Field(..., description="Average power factor", example=0.87)
    Avg_Voltage:       float = Field(..., description="Average voltage (V)", example=220.0)

    # Imbalance & magnitude
    I_imbalance:       float = Field(..., description="Current imbalance ratio", example=0.05)
    V_imbalance:       float = Field(..., description="Voltage imbalance ratio", example=0.02)
    current_magnitude: float = Field(..., description="RMS current magnitude", example=263.4)
    zero_seq:          float = Field(..., description="Zero sequence current", example=0.3)
    I_imbalance_diff:  float = Field(..., description="Delta of I_imbalance", example=0.001)

    # Time features
    hour:      int = Field(..., ge=0, le=23, description="Hour of day (0-23)", example=14)
    dayofweek: int = Field(..., ge=0, le=6,  description="Day of week (0=Mon)", example=2)
    is_night:  int = Field(..., ge=0, le=1,  description="Is nighttime (1/0)", example=0)

    # Rolling statistics (imbalance)
    I_imbalance_rmean_4:  float = Field(0.0, description="Rolling mean of I_imbalance (window=4)")
    I_imbalance_rstd_4:   float = Field(0.0, description="Rolling std of I_imbalance (window=4)")
    curr_mag_rmean_4:     float = Field(0.0, description="Rolling mean of current_magnitude (window=4)")
    I_imbalance_rmean_8:  float = Field(0.0)
    I_imbalance_rstd_8:   float = Field(0.0)
    curr_mag_rmean_8:     float = Field(0.0)
    I_imbalance_rmean_12: float = Field(0.0)
    I_imbalance_rstd_12:  float = Field(0.0)
    curr_mag_rmean_12:    float = Field(0.0)

    # Lag features
    I_lag_1:    float = Field(0.0, description="I_imbalance lagged by 1 step")
    curr_lag_1: float = Field(0.0, description="current_magnitude lagged by 1 step")
    I_lag_2:    float = Field(0.0)
    curr_lag_2: float = Field(0.0)
    I_lag_3:    float = Field(0.0)
    curr_lag_3: float = Field(0.0)
    I_lag_4:    float = Field(0.0)
    curr_lag_4: float = Field(0.0)
    I_lag_8:    float = Field(0.0)
    curr_lag_8: float = Field(0.0)


class FaultClassificationInput(BaseModel):
    """Phase currents & voltages for fault type classification."""
    Ia: float = Field(..., description="Phase A current (A)", example=-151.29)
    Ib: float = Field(..., description="Phase B current (A)", example=-9.68)
    Ic: float = Field(..., description="Phase C current (A)", example=85.80)
    Va: float = Field(..., description="Phase A voltage (pu)", example=0.40)
    Vb: float = Field(..., description="Phase B voltage (pu)", example=-0.13)
    Vc: float = Field(..., description="Phase C voltage (pu)", example=-0.27)


class LocalizationInput(BaseModel):
    """Three-phase voltages and currents for fault localization."""
    V1: float = Field(..., description="Phase 1 voltage (kV)", example=33.188)
    V2: float = Field(..., description="Phase 2 voltage (kV)", example=33.993)
    V3: float = Field(..., description="Phase 3 voltage (kV)", example=33.500)
    I1: float = Field(..., description="Phase 1 current (A)", example=120.5)
    I2: float = Field(..., description="Phase 2 current (A)", example=118.2)
    I3: float = Field(..., description="Phase 3 current (A)", example=121.0)


class LatentAlertInput(BaseModel):
    """Feeder telemetry for anomaly/spike detection."""
    feeder_load:   float = Field(..., description="Current feeder load (MW)", example=9.16)
    hour:          int   = Field(..., ge=0, le=23, example=14)
    month:         int   = Field(..., ge=1, le=12, example=7)
    dayofweek:     int   = Field(..., ge=0, le=6,  example=2)
    temperature:   float = Field(..., description="Ambient temperature (°C)", example=38.0)
    humidity:      float = Field(..., description="Relative humidity (%)", example=70.0)
    wind_speed:    float = Field(0.0,  description="Wind speed (km/h)")
    precipitation: float = Field(0.0,  description="Precipitation (mm)")
    is_rain:       int   = Field(0,    ge=0, le=1)
    is_weekend:    int   = Field(0,    ge=0, le=1)
    is_peak_hour:  int   = Field(0,    ge=0, le=1)
    season:        str   = Field("summer", description="Season: winter/spring/summer/monsoon/autumn")
    temp_bucket:   str   = Field("warm",   description="Temp bucket: cold/mild/warm/hot/extreme")

    # Baseline (if known; otherwise estimated)
    baseline_mean: Optional[float] = Field(None, description="Historical baseline mean load")
    baseline_std:  Optional[float] = Field(None, description="Historical baseline std load")
    # Load history for accurate lag/rolling features (computed server-side)
    load_history:  Optional[List[float]] = Field(None, description="Last 60 feeder_load readings (oldest first). Enables lag/rolling stats.")


class FullPipelineInput(BaseModel):
    """
    Full pipeline input — runs all 5 modules in sequence.
    fault_prediction and latent_alert run always.
    classification + localization + ETR only run if fault is predicted.
    """
    # Required for fault prediction
    fault_prediction: FaultPredictionInput

    # Required for latent alert (independent)
    latent_alert: LatentAlertInput

    # Optional for classification + localization (provide if fault already known)
    fault_classification: Optional[FaultClassificationInput] = None
    localization:         Optional[LocalizationInput]        = None


# ══════════════════════════════════════════════════════════
# RESPONSE SCHEMAS
# ══════════════════════════════════════════════════════════

class FaultPredictionResult(BaseModel):
    fault_predicted:    bool
    fault_probability:  float
    confidence_pct:     float
    risk_level:         str   # LOW / MEDIUM / HIGH / CRITICAL

class FaultClassificationResult(BaseModel):
    fault_type_code:  int
    fault_type_label: str
    confidence_pct:   float
    all_probabilities: Dict[str, float]

class LocalizationResult(BaseModel):
    substation_id:    int
    substation_name:  str
    distance_km:      float
    zone:             str
    distance_source:  Optional[str] = None

class ETRResult(BaseModel):
    fault_type:         str
    typical_hours:      float
    min_hours:          float
    max_hours:          float
    estimated_recovery: str  # Human-readable
    source:             Optional[str] = None

class LatentAlertResult(BaseModel):
    anomaly_detected:  bool
    anomaly_probability: float
    alert_type:        str   # NORMAL / SPIKE / ANOMALY
    notes:             str

class PipelineResult(BaseModel):
    id:               str
    timestamp:        str
    status:           str = "pending"  # pending, investigated, resolved, false_positive
    pipeline:         FaultPredictionResult
    classification:   Optional[FaultClassificationResult] = None
    localization:     Optional[LocalizationResult]        = None
    etr:              Optional[ETRResult]                 = None
    latent_alert:     LatentAlertResult
    pipeline_stages_run: List[str]

class ModelStatusResponse(BaseModel):
    model_config = ConfigDict(protected_namespaces=())

    model_name:   str
    status:       str
    model_type:   str
    description:  str
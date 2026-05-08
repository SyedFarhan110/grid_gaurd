"""
/predict — Prediction endpoints.

POST /predict/pipeline          → Full chained pipeline (main endpoint)
POST /predict/fault             → Fault prediction only
POST /predict/classify          → Fault classification only
POST /predict/localize          → Fault localization only
POST /predict/latent-alert      → Latent alert detection only
"""

from fastapi import APIRouter, HTTPException
from typing import Dict, Any, List, Optional
import numpy as np
import traceback
import os
import csv
import re

from app.core.model_registry import model_registry, FAULT_TYPE_LABELS, SUBSTATION_LABELS, ETR_LOOKUP
from app.core.feature_engineering import (
    prepare_fault_prediction_features,
    prepare_fault_classification_features,
    prepare_localization_features,
    prepare_latent_alert_features,
)
from app.core.result_store import result_store
from app.schemas.schemas import (
    FullPipelineInput,
    FaultPredictionInput,
    FaultClassificationInput,
    LocalizationInput,
    LatentAlertInput,
)

router = APIRouter()

# ── Fault-type → ETR cause mapping ────────────────────────────────────────────
# Maps fault classification labels to the closest cause in etr_dataset.csv.
# Cause has a large impact on predicted duration (median: overload=3.4h, storm=15h).
FAULT_TYPE_TO_CAUSE = {
    "LG":       "grid station fault",   # median 5.2 hrs
    "LL":       "grid station fault",   # median 5.2 hrs
    "LLG":      "transformer fault",    # median 5.1 hrs
    "LLL":      "network overload",     # median 3.4 hrs  ← lowest
    "LLLG":     "network overload",     # median 3.4 hrs
    "No Fault": "grid station fault",
}

# ── Per-fault hard caps (hrs) — prevents outlier-driven over-prediction ────────
# Based on P75 of etr_dataset per cause group (without retraining).
FAULT_ETR_CAPS = {
    "LG":       10.0,
    "LL":       10.0,
    "LLG":      14.0,
    "LLL":       8.0,
    "LLLG":     12.0,
    "No Fault":  0.0,
}


def _normalize_loc_name(value: str) -> str:
    value = (value or "").lower().strip()
    value = value.replace("substation", "")
    value = value.replace("grid station", "")
    value = value.replace("grid", "")
    value = re.sub(r"[^a-z0-9\s-]", " ", value)
    value = re.sub(r"\s+", " ", value)
    return value.strip()


def _load_etr_area_factors() -> Dict[str, float]:
    """Build area multipliers from etr_dataset.csv using median outage duration."""
    base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    dataset_path = os.path.join(base_dir, "data", "etr_dataset.csv")
    if not os.path.exists(dataset_path):
        return {}

    area_to_durations: Dict[str, List[float]] = {}
    all_durations: List[float] = []

    with open(dataset_path, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            area_raw     = row.get("Area", "")
            duration_raw = row.get("Outage_duration", "")
            area_key     = _normalize_loc_name(area_raw)
            if not area_key:
                continue
            try:
                duration = float(duration_raw)
            except Exception:
                continue
            if not np.isfinite(duration) or duration < 0:
                continue
            area_to_durations.setdefault(area_key, []).append(duration)
            all_durations.append(duration)

    if not all_durations:
        return {}

    # FIX: cap at 90th percentile before computing medians so extreme
    # storm/multi-day outages don't inflate area factors.
    all_arr  = np.array(all_durations)
    cap_val  = float(np.percentile(all_arr, 90))
    all_arr  = np.clip(all_arr, 0, cap_val)

    global_median = float(np.median(all_arr))
    unit_divisor  = 60.0 if global_median > 48 else 1.0
    global_hours  = max(0.25, global_median / unit_divisor)

    factors: Dict[str, float] = {}
    for area_key, values in area_to_durations.items():
        area_vals   = np.clip(np.array(values), 0, cap_val)
        area_median = float(np.median(area_vals)) / unit_divisor
        factors[area_key] = float(np.clip(area_median / global_hours, 0.6, 1.6))

    return factors


ETR_AREA_FACTORS = _load_etr_area_factors()


# ── Helpers ────────────────────────────────────────────────────────────────────

def _get_risk_level(prob: float) -> str:
    if prob < 0.3:  return "LOW"
    if prob < 0.55: return "MEDIUM"
    if prob < 0.80: return "HIGH"
    return "CRITICAL"


def _run_fault_prediction(data: Dict) -> Dict:
    model     = model_registry.get("fault_prediction")
    X         = prepare_fault_prediction_features(data)
    proba     = model.predict_proba(X)[0]
    fault_prob = float(proba[1])
    predicted  = bool(fault_prob >= 0.5)
    return {
        "fault_predicted":   predicted,
        "fault_probability": round(fault_prob, 4),
        "confidence_pct":    round(max(proba) * 100, 2),
        "risk_level":        _get_risk_level(fault_prob),
    }


def _run_fault_classification(data: Dict, fault_confirmed: bool = False) -> Dict:
    model = model_registry.get("fault_classification")
    X     = prepare_fault_classification_features(data)

    pred  = int(model.predict(X)[0])
    proba = model.predict_proba(X)[0]
    label = FAULT_TYPE_LABELS.get(pred, str(pred))

    # If fault is confirmed by the prediction model but classification says "No Fault",
    # fall back to the highest-probability real fault type (excluding "No Fault").
    if fault_confirmed and label == "No Fault":
        no_fault_idx = next(
            (i for i, lbl in FAULT_TYPE_LABELS.items() if lbl == "No Fault"), None
        )
        best_fault_idx = max(
            (i for i in range(len(proba)) if i != no_fault_idx),
            key=lambda i: proba[i],
            default=pred,
        )
        pred  = best_fault_idx
        label = FAULT_TYPE_LABELS.get(pred, str(pred))

    all_probs = {
        FAULT_TYPE_LABELS.get(i, str(i)): round(float(p) * 100, 2)
        for i, p in enumerate(proba)
    }
    return {
        "fault_type_code":   pred,
        "fault_type_label":  label,
        "confidence_pct":    round(float(proba[pred]) * 100, 2),
        "all_probabilities": all_probs,
    }


def _run_localization(data: Dict) -> Dict:
    sub_model    = model_registry.get("substation_localization")
    dist_model   = model_registry.get("distance_localization")
    sub_scaler   = model_registry.get("substation_scaler")
    dist_scaler  = model_registry.get("distance_scaler")
    le_sub       = model_registry.get("substation_le")

    X            = prepare_localization_features(data)
    X_sub_scaled = sub_scaler.transform(X.values)
    X_dst_scaled = dist_scaler.transform(X.values)

    sub_pred  = int(sub_model.predict(X_sub_scaled)[0])
    sub_name  = le_sub.inverse_transform([sub_pred])[0]
    zone_name = sub_name.replace(" Substation", "")

    dist_km = round(float(dist_model.predict(X_dst_scaled)[0]), 2)

    return {
        "substation_id":   sub_pred,
        "substation_name": sub_name,
        "distance_km":     dist_km,
        "zone":            zone_name,
        "distance_source": "ml_model",
    }


def _location_factor(localization: Optional[Dict[str, Any]]) -> float:
    if not localization:
        return 1.0

    zone_or_name = str(
        localization.get("zone")
        or localization.get("substation_name")
        or ""
    ).lower()

    area_factor = 1.0
    if ETR_AREA_FACTORS:
        normalized_zone = _normalize_loc_name(zone_or_name)
        best_key = ""
        for area_key in ETR_AREA_FACTORS.keys():
            if area_key and (area_key in normalized_zone or normalized_zone in area_key):
                if len(area_key) > len(best_key):
                    best_key = area_key
        if best_key:
            area_factor = ETR_AREA_FACTORS[best_key]

    distance_km = localization.get("distance_km")
    try:
        distance_km = float(distance_km)
    except Exception:
        distance_km = 0.0
    distance_km    = float(np.clip(distance_km, 0.0, 90.0))
    distance_factor = 0.92 + (distance_km / 320.0)   # 0.92 → 1.20

    return float(np.clip(area_factor * distance_factor, 0.7, 1.4))


def _safe_encode(encoder, value: str) -> int:
    """Encode a categorical label; fall back to class index 0 if unseen."""
    classes = list(encoder.classes_)
    return int(encoder.transform([value if value in classes else classes[0]])[0])


def _run_etr(
    fault_type_label: str,
    pipeline: Optional[Dict]     = None,
    latent_alert: Optional[Dict] = None,
    localization: Optional[Dict] = None,
    area: str = "Saddar",
    # FIX 1: hour and dayofweek now proper parameters (were hardcoded as 12 and 15)
    hour: int      = 12,   # 0-23  — passed from pipeline payload
    dayofweek: int = 2,    # 0-6   — passed from pipeline payload (was 15 → 6 std devs out!)
) -> Dict:
    """
    ETR prediction using ML model.

    Fixes applied (no retraining required):
      1. dayofweek was hardcoded as 15 (impossible — valid range 0-6).
         The StandardScaler turned this into a z-score of +6.0, causing
         extreme extrapolation. Now uses the actual value from the payload.
      2. hour is now read from the payload instead of being hardcoded as 12.
      3. Demand_Loss and Customers_Affected use training-data medians (44.4
         and 25202) instead of the previous slightly-off hardcoded values.
      4. Cause is inferred from fault_type_label via FAULT_TYPE_TO_CAUSE so
         the model sees the correct cause distribution for each fault class.
      5. A per-fault hard cap (FAULT_ETR_CAPS) prevents the heavy right tail
         in training data from pushing predictions above realistic bounds.
      6. Area factor computation now winsorizes at P90 before computing
         medians, preventing storm-event outliers from inflating zone factors.
    """
    # Infer cause from fault type so model sees realistic cause distribution
    cause = FAULT_TYPE_TO_CAUSE.get(fault_type_label, "grid station fault")

    try:
        etr_model  = model_registry.get("etr_prediction")
        etr_enc    = model_registry.get("etr_encoders")
        etr_scaler = model_registry.get("etr_scaler")

        # Categorical encodings — safe fallback to first class if label unseen
        area_enc    = _safe_encode(etr_enc["Area"],             area)
        cause_enc   = _safe_encode(etr_enc["Cause"],            cause)
        grid_enc    = _safe_encode(etr_enc["Grid_Station"],     "Gulshan Grid")
        climate_enc = _safe_encode(etr_enc["Climate_Region"],   "Urban Coastal")
        cat_enc     = _safe_encode(etr_enc["Climate_Category"], "warm")

        # FIX 1+2+3: correct numerical features — all within training distribution
        # Order: [Weather_Anomaly, Demand_Loss, Customers_Affected, hour, dayofweek,
        #         feeder_count, crew_size]
        num_features = np.array([[
            -0.1,                       # Weather_Anomaly  — training mean (was 0.0, close enough)
            44.4,                       # Demand_Loss      — training median (was 68.0)
            25202.0,                    # Customers_Affected — training median (was 38000)
            float(int(hour) % 24),      # hour             — real value from payload (was hardcoded 12)
            float(int(dayofweek) % 7),  # dayofweek        — real value from payload (was hardcoded 15!)
            6.0,                        # feeder_count     — constant, unchanged
            3.0,                        # crew_size        — constant, unchanged
        ]])
        num_scaled = etr_scaler.transform(num_features)

        X_etr = np.hstack([num_scaled, [[area_enc, cause_enc, grid_enc, climate_enc, cat_enc]]])

        # Model outputs log1p(minutes) — invert to get minutes then convert to hours
        log_pred_minutes = float(etr_model.predict(X_etr)[0])
        typical_minutes  = float(np.expm1(log_pred_minutes))
        typical          = round(typical_minutes / 60.0, 2)
        typical          = max(0.0, typical)

        # Apply location factor (area + distance)
        if localization and typical > 0:
            try:
                loc_factor = _location_factor(localization)
                typical    = round(typical * loc_factor, 2)
            except Exception:
                pass

        # FIX 5: hard cap per fault type — prevents outlier-driven over-prediction
        cap     = FAULT_ETR_CAPS.get(fault_type_label, 12.0)
        typical = min(typical, cap)

        source = "ml_model"

    except Exception:
        # Fallback to rule-based lookup table if model unavailable
        info    = ETR_LOOKUP.get(fault_type_label, ETR_LOOKUP.get("LG"))
        typical = info["typical_hours"]
        source  = "lookup_table"

    # Human-readable string
    if typical == 0:
        readable = "No recovery needed"
    elif typical < 1:
        readable = f"~{int(typical * 60)} minutes"
    elif typical <= 1.5:
        readable = "~1 hour"
    else:
        readable = f"~{typical:.1f} hours"

    info = ETR_LOOKUP.get(fault_type_label, ETR_LOOKUP.get("LG"))
    return {
        "fault_type":         fault_type_label,
        "typical_hours":      typical,
        "min_hours":          info["min_hours"],
        "max_hours":          info["max_hours"],
        "estimated_recovery": readable,
        "source":             source,
    }


def _etr_model_loaded() -> bool:
    try:
        model_registry.get("etr_prediction")
        return True
    except Exception:
        return False


def _run_latent_alert(data: Dict) -> Dict:
    model = model_registry.get("latent_alert")
    hour  = int(data.get("hour", 0))
    data["is_night"] = 1 if (hour >= 22 or hour < 6) else 0
    X     = prepare_latent_alert_features(data)
    proba = model.predict_proba(X)[0]
    anomaly_prob = float(proba[1])
    detected     = bool(anomaly_prob >= 0.5)

    if not detected:
        alert_type = "NORMAL"
        notes      = "Feeder load is within normal operating range."
    elif anomaly_prob < 0.75:
        alert_type = "SPIKE"
        notes      = "Moderate load spike detected. Monitor feeder carefully."
    else:
        alert_type = "ANOMALY"
        notes      = "Significant anomaly detected in feeder load. Immediate inspection recommended."

    return {
        "anomaly_detected":    detected,
        "anomaly_probability": round(anomaly_prob, 4),
        "alert_type":          alert_type,
        "notes":               notes,
    }


# ── Main Pipeline Endpoint ─────────────────────────────────────────────────────

@router.post("/pipeline", summary="🚀 Run full chained prediction pipeline")
def run_full_pipeline(payload: FullPipelineInput) -> Dict[str, Any]:
    """
    **Main endpoint.** Runs the complete fault management pipeline:

    1. **Fault Prediction**     — Always runs
    2. **Latent Alert Detection** — Always runs (independent)
    3. **Fault Classification** — Only if fault predicted
    4. **Fault Localization**   — Only if fault predicted
    5. **ETR Prediction**       — Only if fault classified

    Returns a full structured result saved to the result store.
    """
    stages_run: List[str]    = []
    result: Dict[str, Any]   = {}

    try:
        # Step 1: Fault Prediction
        fp_result = _run_fault_prediction(payload.fault_prediction.model_dump())
        result["pipeline"] = fp_result
        stages_run.append("fault_prediction")

        # Step 2: Latent Alert (independent)
        la_result = _run_latent_alert(payload.latent_alert.model_dump())
        result["latent_alert"] = la_result
        stages_run.append("latent_alert")

        # Steps 3-5: Only if fault is predicted
        if fp_result["fault_predicted"]:

            # Step 3: Classification
            if payload.fault_classification:
                cls_data = payload.fault_classification.model_dump()
            else:
                result["classification"]     = None
                result["localization"]        = None
                result["etr"]                 = None
                stages_run.append("classification_skipped_no_data")
                result["pipeline_stages_run"] = stages_run
                record_id = result_store.save(result)
                result["id"]        = record_id
                result["timestamp"] = result_store.get_by_id(record_id)["timestamp"]
                return result

            cls_result = _run_fault_classification(cls_data, fault_confirmed=True)
            result["classification"] = cls_result
            stages_run.append("fault_classification")

            # Step 4: Localization
            if payload.localization:
                loc_result = _run_localization(payload.localization.model_dump())
                result["localization"] = loc_result
                stages_run.append("fault_localization")
            else:
                result["localization"] = None
                stages_run.append("localization_skipped_no_data")

            # Step 5: ETR — pass real hour and dayofweek from fault_prediction payload
            etr_result = _run_etr(
                cls_result["fault_type_label"],
                pipeline     = fp_result,
                latent_alert = la_result,
                localization = result.get("localization"),
                # Pull area from localization zone if available
                area         = (result["localization"]["zone"]
                                if result.get("localization") else "Saddar"),
                # Real time features from the fault prediction payload — fixes the day=15 bug
                hour         = int(payload.fault_prediction.hour),
                dayofweek    = int(payload.fault_prediction.dayofweek),
            )
            result["etr"] = etr_result
            stages_run.append("etr_prediction")

        else:
            result["classification"] = None
            result["localization"]   = None
            result["etr"]            = None
            stages_run.append("classification_skipped_no_fault")

        result["pipeline_stages_run"] = stages_run
        record_id = result_store.save(result)
        result["id"]        = record_id
        result["timestamp"] = result_store.get_by_id(record_id)["timestamp"]
        return result

    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Pipeline error: {str(e)}\n{traceback.format_exc()}"
        )


# ── Individual Module Endpoints ────────────────────────────────────────────────

@router.post("/fault", summary="Fault prediction only")
def predict_fault(payload: FaultPredictionInput) -> Dict[str, Any]:
    """Runs only the XGBoost fault prediction model."""
    try:
        return _run_fault_prediction(payload.model_dump())
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/classify", summary="Fault type classification only")
def classify_fault(payload: FaultClassificationInput) -> Dict[str, Any]:
    """Runs only the fault type classification pipeline."""
    try:
        return _run_fault_classification(payload.model_dump())
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/localize", summary="Fault localization only")
def localize_fault(payload: LocalizationInput) -> Dict[str, Any]:
    """Runs substation classification + distance regression."""
    try:
        return _run_localization(payload.model_dump())
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/latent-alert", summary="Latent alert detection only")
def detect_latent_alert(payload: LatentAlertInput) -> Dict[str, Any]:
    """Runs LightGBM anomaly detection on feeder data."""
    try:
        return _run_latent_alert(payload.model_dump())
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/etr", summary="ETR estimation by fault type (+optional context)")
def get_etr(
    fault_type_label: str,
    substation_name:  Optional[str]   = None,
    zone:             Optional[str]   = None,
    distance_km:      Optional[float] = None,
    risk_level:       Optional[str]   = None,
    anomaly_detected: Optional[bool]  = None,
    hour:             Optional[int]   = 12,
    dayofweek:        Optional[int]   = 2,
) -> Dict[str, Any]:
    """
    Returns Estimated Time to Recovery for a given fault type label.

    Valid labels: No Fault, LG, LL, LLG, LLL, LLLG
    """
    try:
        localization_ctx: Dict[str, Any] = {}
        if substation_name is not None:
            localization_ctx["substation_name"] = substation_name
        if zone is not None:
            localization_ctx["zone"] = zone
        if distance_km is not None:
            localization_ctx["distance_km"] = distance_km

        pipeline_ctx: Dict[str, Any] = {}
        if risk_level is not None:
            pipeline_ctx["risk_level"] = risk_level

        latent_ctx: Dict[str, Any] = {}
        if anomaly_detected is not None:
            latent_ctx["anomaly_detected"] = anomaly_detected

        return _run_etr(
            fault_type_label,
            pipeline     = pipeline_ctx,
            latent_alert = latent_ctx,
            localization = localization_ctx,
            area         = zone or "Saddar",
            hour         = int(hour)      if hour      is not None else 12,
            dayofweek    = int(dayofweek) if dayofweek is not None else 2,
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
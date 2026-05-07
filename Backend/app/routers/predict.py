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
            area_raw = row.get("Area", "")
            duration_raw = row.get("Outage_duration", "")
            area_key = _normalize_loc_name(area_raw)
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

    # Infer unit from distribution. Dataset appears minute-based for large values.
    global_median = float(np.median(all_durations))
    unit_divisor = 60.0 if global_median > 48 else 1.0
    global_hours = max(0.25, global_median / unit_divisor)

    factors: Dict[str, float] = {}
    for area_key, values in area_to_durations.items():
        area_median = float(np.median(values)) / unit_divisor
        factors[area_key] = float(np.clip(area_median / global_hours, 0.6, 1.9))

    return factors


ETR_AREA_FACTORS = _load_etr_area_factors()


# ── Helpers ────────────────────────────────────────────────────────────────────

def _get_risk_level(prob: float) -> str:
    if prob < 0.3:   return "LOW"
    if prob < 0.55:  return "MEDIUM"
    if prob < 0.80:  return "HIGH"
    return "CRITICAL"


def _run_fault_prediction(data: Dict) -> Dict:
    model = model_registry.get("fault_prediction")
    X = prepare_fault_prediction_features(data)
    proba = model.predict_proba(X)[0]
    fault_prob = float(proba[1])
    predicted = bool(fault_prob >= 0.5)
    return {
        "fault_predicted":   predicted,
        "fault_probability": round(fault_prob, 4),
        "confidence_pct":    round(max(proba) * 100, 2),
        "risk_level":        _get_risk_level(fault_prob),
    }


def _run_fault_classification(data: Dict) -> Dict:
    model = model_registry.get("fault_classification")
    X = prepare_fault_classification_features(data)
    pred = int(model.predict(X)[0])
    proba = model.predict_proba(X)[0]
    label = FAULT_TYPE_LABELS.get(pred, f"Unknown ({pred})")
    all_probs = {
        FAULT_TYPE_LABELS[i]: round(float(p) * 100, 2)
        for i, p in enumerate(proba)
    }
    return {
        "fault_type_code":    pred,
        "fault_type_label":   label,
        "confidence_pct":     round(float(max(proba)) * 100, 2),
        "all_probabilities":  all_probs,
    }


def _run_localization(data: Dict) -> Dict:
    sub_model = model_registry.get("substation_localization")
    X = prepare_localization_features(data)
    sub_pred = int(sub_model.predict(X.values)[0])
    sub_name = SUBSTATION_LABELS.get(sub_pred, f"Zone {sub_pred}")

    # Distance: use ML model if uploaded, else rule-based from Z_apparent.
    # The trained regressor is documented as predicting distance in km directly.
    dist_source = "ml_model"
    try:
        dist_model = model_registry.get("distance_localization")
        raw_dist   = float(dist_model.predict(X.values)[0])
        if not np.isfinite(raw_dist):
            raise ValueError("distance model returned a non-finite value")
        # Clamp to a realistic feeder distance range to avoid runaway outputs.
        dist_km    = round(float(np.clip(raw_dist, 0.5, 90.0)), 2)
    except Exception:
        # Fallback: estimate from Z_apparent (V3/I1 is an impedance proxy for distance)
        z_apparent  = data["V3"] / (data["I1"] + 1e-6)
        dist_km     = round(min(90.0, max(0.5, abs(z_apparent) * 0.3)), 1)
        dist_source = "estimated"

    return {
        "substation_id":   sub_pred,
        "substation_name": sub_name,
        "distance_km":     dist_km,
        "zone":            sub_name.replace(" Substation", ""),
        "distance_source": dist_source,
    }


def _location_factor(localization: Optional[Dict[str, Any]]) -> float:
    if not localization:
        return 1.0

    zone_or_name = str(
        localization.get("zone")
        or localization.get("substation_name")
        or ""
    ).lower()

    # Area factor from etr_dataset.csv (median outage duration by area).
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

    # Distance factor: farther faults generally increase dispatch/isolation/repair time.
    distance_km = localization.get("distance_km")
    try:
        distance_km = float(distance_km)
    except Exception:
        distance_km = 0.0
    distance_km = float(np.clip(distance_km, 0.0, 90.0))
    distance_factor = 0.92 + (distance_km / 320.0)  # ~0.92 to ~1.20

    return float(np.clip(area_factor * distance_factor, 0.7, 1.6))


def _run_etr(
    fault_type_label: str,
    pipeline: Optional[Dict[str, Any]] = None,
    latent_alert: Optional[Dict[str, Any]] = None,
    localization: Optional[Dict[str, Any]] = None,
) -> Dict:
    """
    ETR model output is in log-transformed form (log1p during training).
    Apply np.expm1() to convert back to actual hours.
    Falls back to lookup table if etr_model is not loaded.
    """
    try:
        etr_model = model_registry.get("etr_prediction")
        # Encode fault type as integer for the model
        fault_type_map = {v: k for k, v in FAULT_TYPE_LABELS.items()}
        fault_code = fault_type_map.get(fault_type_label, 1)
        X_etr = np.array([[fault_code]])
        log_pred = float(etr_model.predict(X_etr)[0])
        # Inverse of log1p transform used during training
        typical = round(float(np.expm1(log_pred)), 2)
        typical = max(0.0, typical)
    except Exception:
        # Fallback to lookup table when etr_model is not uploaded yet
        info = ETR_LOOKUP.get(fault_type_label, ETR_LOOKUP["Single Line-to-Ground (SLG)"])
        typical = info["typical_hours"]

    # Contextual adjustment so same fault type can produce different ETR by area/severity.
    risk_level = str((pipeline or {}).get("risk_level", "LOW")).upper()
    risk_factor_map = {
        "LOW": 0.95,
        "MEDIUM": 1.05,
        "HIGH": 1.15,
        "CRITICAL": 1.30,
    }
    risk_factor = risk_factor_map.get(risk_level, 1.0)
    anomaly_factor = 1.12 if bool((latent_alert or {}).get("anomaly_detected")) else 1.0
    location_factor = _location_factor(localization)

    typical = round(max(0.0, typical * risk_factor * anomaly_factor * location_factor), 2)

    if typical == 0:
        readable = "No recovery needed"
    elif typical < 1:
        readable = f"~{int(typical * 60)} minutes"
    elif typical <= 1.5:
        readable = "~1 hour"
    else:
        readable = f"~{typical:.1f} hours"

    if typical == 0:
        min_hours = 0.0
        max_hours = 0.0
    else:
        # Dynamic range around context-adjusted typical; avoids rigid fixed multiples.
        spread = 0.28 + (0.18 if bool((latent_alert or {}).get("anomaly_detected")) else 0.0)
        min_hours = round(max(0.0, typical * (0.72 - spread * 0.2)), 2)
        max_hours = round(max(typical, typical * (1.38 + spread)), 2)

    return {
        "fault_type":         fault_type_label,
        "typical_hours":      typical,
        "min_hours":          min_hours,
        "max_hours":          max_hours,
        "estimated_recovery": readable,
        "source":             "contextual_ml" if _etr_model_loaded() else "contextual_lookup",
    }


def _etr_model_loaded() -> bool:
    try:
        model_registry.get("etr_prediction")
        return True
    except Exception:
        return False


def _run_latent_alert(data: Dict) -> Dict:
    model = model_registry.get("latent_alert")
    X = prepare_latent_alert_features(data)
    proba = model.predict_proba(X)[0]
    anomaly_prob = float(proba[1])
    detected = bool(anomaly_prob >= 0.5)

    if not detected:
        alert_type = "NORMAL"
        notes = "Feeder load is within normal operating range."
    elif anomaly_prob < 0.75:
        alert_type = "SPIKE"
        notes = "Moderate load spike detected. Monitor feeder carefully."
    else:
        alert_type = "ANOMALY"
        notes = "Significant anomaly detected in feeder load. Immediate inspection recommended."

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

    1. **Fault Prediction** — Always runs
    2. **Latent Alert Detection** — Always runs (independent)
    3. **Fault Classification** — Only if fault predicted
    4. **Fault Localization** — Only if fault predicted
    5. **ETR Prediction** — Only if fault classified

    Returns a full structured result saved to the result store.
    """
    stages_run: List[str] = []
    result: Dict[str, Any] = {}

    try:
        # Step 1: Fault Prediction
        fp_result = _run_fault_prediction(payload.fault_prediction.model_dump())
        result["pipeline"] = fp_result
        stages_run.append("fault_prediction")

        # Step 2: Latent Alert (independent)
        la_result = _run_latent_alert(payload.latent_alert.model_dump())
        result["latent_alert"] = la_result
        stages_run.append("latent_alert")

        # Step 3-5: Only if fault is predicted
        if fp_result["fault_predicted"]:

            # Step 3: Classification (use provided data or fall back to fault_prediction data)
            if payload.fault_classification:
                cls_data = payload.fault_classification.model_dump()
            else:
                # Can't classify without phase current/voltage data
                result["classification"] = None
                result["localization"]   = None
                result["etr"]            = None
                stages_run.append("classification_skipped_no_data")
                result["pipeline_stages_run"] = stages_run
                record_id = result_store.save(result)
                result["id"] = record_id
                result["timestamp"] = result_store.get_by_id(record_id)["timestamp"]
                return result

            cls_result = _run_fault_classification(cls_data)
            result["classification"] = cls_result
            stages_run.append("fault_classification")

            # Step 4: Localization
            if payload.localization:
                loc_data = payload.localization.model_dump()
            else:
                result["localization"] = None
                stages_run.append("localization_skipped_no_data")

            if payload.localization:
                loc_result = _run_localization(loc_data)
                result["localization"] = loc_result
                stages_run.append("fault_localization")

            # Step 5: ETR
            etr_result = _run_etr(
                cls_result["fault_type_label"],
                pipeline=fp_result,
                latent_alert=la_result,
                localization=result.get("localization"),
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
        result["id"] = record_id
        result["timestamp"] = result_store.get_by_id(record_id)["timestamp"]
        return result

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Pipeline error: {str(e)}\n{traceback.format_exc()}")


# ── Individual Module Endpoints ─────────────────────────────────────────────────

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
    substation_name: Optional[str] = None,
    zone: Optional[str] = None,
    distance_km: Optional[float] = None,
    risk_level: Optional[str] = None,
    anomaly_detected: Optional[bool] = None,
) -> Dict[str, Any]:
    """
    Returns Estimated Time to Recovery for a given fault type label.

    Valid labels:
    - No Fault
    - Single Line-to-Ground (SLG)
    - Line-to-Line (LL)
    - Double Line-to-Ground (DLG)
    - Three-Phase (3PH)
    - Three-Phase-to-Ground (3PG)
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
            pipeline=pipeline_ctx,
            latent_alert=latent_ctx,
            localization=localization_ctx,
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
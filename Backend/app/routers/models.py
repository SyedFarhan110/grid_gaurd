"""
/models — Model management endpoints.
GET  /models/status  → Status of all loaded models
POST /models/load    → Load all models (or reload)
POST /models/reload/{model_name} → Reload a specific model
"""

from fastapi import APIRouter, HTTPException
from typing import Dict, Any, Optional

from app.core.model_registry import model_registry, MODEL_PATHS

router = APIRouter()

MODEL_DESCRIPTIONS = {
    "fault_prediction":        "XGBoost classifier — predicts if a fault will occur in the next hour",
    "fault_classification":    "Decision Tree Pipeline — classifies fault type (SLG/LL/DLG/3PH/3PG)",
    "substation_localization": "Random Forest classifier — identifies the affected substation (30 zones)",
    "distance_localization":   "Gradient Boosting regressor — estimates fault distance in km",
    "latent_alert":            "LightGBM classifier — detects feeder load anomalies and spikes",
}


@router.get("/status", summary="Get status of all ML models")
def get_model_status() -> Dict[str, Any]:
    """Returns load status, type, and description for each model."""
    statuses = []
    for name, status in model_registry.status.items():
        try:
            m = model_registry.get(name)
            model_type = type(m).__name__
        except Exception:
            model_type = "N/A"

        statuses.append({
            "model_name":  name,
            "status":      status,
            "model_type":  model_type,
            "description": MODEL_DESCRIPTIONS.get(name, ""),
            "path":        MODEL_PATHS.get(name, ""),
        })

    return {
        "loaded": model_registry.loaded_count,
        "total":  model_registry.total_count,
        "all_ready": model_registry.loaded_count == model_registry.total_count,
        "models": statuses,
    }


@router.post("/load", summary="Load all models into memory")
def load_all_models() -> Dict[str, Any]:
    """
    Loads (or reloads) all 5 ML models into server memory.
    This is called automatically at startup. Use this to force a reload.
    """
    try:
        model_registry.reload()
        return {
            "message": "All models reloaded successfully",
            "loaded":  model_registry.loaded_count,
            "total":   model_registry.total_count,
            "status":  model_registry.status,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Model loading failed: {str(e)}")


@router.post("/reload/{model_name}", summary="Reload a specific model")
def reload_model(model_name: str) -> Dict[str, Any]:
    """
    Reloads a single model by name. Useful when a model file is updated.

    Valid names:
    - `fault_prediction`
    - `fault_classification`
    - `substation_localization`
    - `distance_localization`
    - `latent_alert`
    """
    if model_name not in MODEL_PATHS:
        raise HTTPException(
            status_code=404,
            detail=f"Unknown model '{model_name}'. Valid: {list(MODEL_PATHS.keys())}",
        )
    try:
        model_registry.reload(model_name)
        return {
            "message":    f"Model '{model_name}' reloaded successfully",
            "model_name": model_name,
            "status":     model_registry.status[model_name],
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
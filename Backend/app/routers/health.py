"""
/health — Server and model health checks.
"""

from fastapi import APIRouter
from typing import Dict, Any
import platform, sys
from datetime import datetime

from app.core.model_registry import model_registry

router = APIRouter()


@router.get("/", summary="Server health check")
def health_check() -> Dict[str, Any]:
    """Returns server status, Python version, and model load status."""
    return {
        "status":       "healthy",
        "timestamp":    datetime.now().isoformat(),
        "python":       sys.version,
        "platform":     platform.system(),
        "models_loaded": model_registry.loaded_count,
        "models_total":  model_registry.total_count,
        "all_ready":     model_registry.loaded_count == model_registry.total_count,
    }


@router.get("/models", summary="Quick model readiness check")
def model_health() -> Dict[str, Any]:
    """Returns pass/fail for each model."""
    results = {}
    all_ok = True
    for name, status in model_registry.status.items():
        ok = status == "loaded"
        results[name] = {"ok": ok, "status": status}
        if not ok:
            all_ok = False
    return {
        "all_models_ready": all_ok,
        "models":           results,
    }
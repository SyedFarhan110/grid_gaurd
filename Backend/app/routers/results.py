"""
/results — View stored prediction history.

GET  /results/            → List recent results
GET  /results/summary     → Stats summary
GET  /results/{id}        → Single result by ID
DELETE /results/clear     → Clear all stored results
"""

from fastapi import APIRouter, HTTPException, Query
from typing import Dict, Any, List

from app.core.result_store import result_store

router = APIRouter()


@router.get("/", summary="List recent prediction results")
def list_results(
    limit:      int  = Query(50,    ge=1, le=500,  description="Max records to return"),
    fault_only: bool = Query(False, description="Show only results where fault was predicted"),
    alert_only: bool = Query(False, description="Show only results where anomaly was detected"),
) -> Dict[str, Any]:
    """Returns the most recent prediction results (latest first)."""
    results = result_store.get_all(limit=limit, fault_only=fault_only, alert_only=alert_only)
    return {
        "count":   len(results),
        "filters": {"fault_only": fault_only, "alert_only": alert_only},
        "results": results,
    }


@router.get("/summary", summary="Get prediction statistics summary")
def get_summary() -> Dict[str, Any]:
    """Returns aggregate stats across all stored prediction results."""
    return result_store.get_summary()


@router.get("/{result_id}", summary="Get a single result by ID")
def get_result(result_id: str) -> Dict[str, Any]:
    """Returns one stored prediction result by its UUID."""
    record = result_store.get_by_id(result_id)
    if not record:
        raise HTTPException(status_code=404, detail=f"Result '{result_id}' not found.")
    return record


@router.patch("/{result_id}/status", summary="Update result status")
def update_status(result_id: str, status: str = Query(..., description="New status (pending/investigated/resolved/false_positive)")) -> Dict[str, Any]:
    """Updates the investigation status of a specific result."""
    success = result_store.update_status(result_id, status)
    if not success:
        raise HTTPException(status_code=404, detail=f"Result '{result_id}' not found or update failed.")
    return {"message": "Status updated successfully", "id": result_id, "status": status}


@router.delete("/clear", summary="Clear all stored results")
def clear_results() -> Dict[str, str]:
    """Clears the in-memory result history. Useful during testing."""
    result_store.clear()
    return {"message": "All results cleared."}
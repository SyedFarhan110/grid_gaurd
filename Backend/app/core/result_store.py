"""
In-memory result store for prediction history.
Stores last 1000 pipeline results for admin review.
"""

from collections import deque
from datetime import datetime
from typing import Dict, Any, List, Optional
import uuid


class ResultStore:
    def __init__(self, max_size: int = 1000):
        self._store: deque = deque(maxlen=max_size)

    def save(self, result: Dict[str, Any]) -> str:
        record = {
            "id": str(uuid.uuid4()),
            "timestamp": datetime.now().isoformat(),
            **result,
        }
        self._store.append(record)
        return record["id"]

    def get_all(
        self,
        limit: int = 50,
        fault_only: bool = False,
        alert_only: bool = False,
    ) -> List[Dict[str, Any]]:
        results = list(self._store)
        results.reverse()  # Latest first

        if fault_only:
            results = [r for r in results if r.get("pipeline", {}).get("fault_predicted") is True]
        if alert_only:
            results = [r for r in results if r.get("latent_alert", {}).get("anomaly_detected") is True]

        return results[:limit]

    def get_by_id(self, record_id: str) -> Optional[Dict[str, Any]]:
        for r in self._store:
            if r["id"] == record_id:
                return r
        return None

    def get_summary(self) -> Dict[str, Any]:
        results = list(self._store)
        total = len(results)
        faults = sum(1 for r in results if r.get("pipeline", {}).get("fault_predicted") is True)
        alerts = sum(1 for r in results if r.get("latent_alert", {}).get("anomaly_detected") is True)

        return {
            "total_predictions": total,
            "total_faults_predicted": faults,
            "total_latent_alerts": alerts,
            "fault_rate_pct": round((faults / total * 100) if total else 0, 2),
            "alert_rate_pct": round((alerts / total * 100) if total else 0, 2),
        }

    def clear(self):
        self._store.clear()


# Singleton
result_store = ResultStore()
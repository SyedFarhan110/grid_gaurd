from collections import deque
from datetime import datetime
from typing import Dict, Any, List, Optional
import uuid

from app.core.db import db_client

class ResultStore:
    def __init__(self, max_size: int = 1000):
        self._cache: deque = deque(maxlen=max_size)
        self.collection_name = "pipeline_results"

    def save(self, result: Dict[str, Any]) -> str:
        record_id = str(uuid.uuid4())
        record = {
            "id": record_id,
            "timestamp": datetime.now().isoformat(),
            "status": "pending",
            **result,
        }
        
        # Save to memory cache
        self._cache.append(record)
        
        # Save to Firestore if enabled AND a fault/anomaly is detected
        is_fault = result.get("pipeline", {}).get("fault_predicted", False)
        is_anomaly = result.get("latent_alert", {}).get("anomaly_detected", False)
        
        if db_client.enabled and (is_fault or is_anomaly):
            try:
                db_client.db.collection(self.collection_name).document(record_id).set(record)
            except Exception as e:
                print(f"Failed to persist to Firestore: {e}")
                
        return record_id

    def get_all(
        self,
        limit: int = 50,
        fault_only: bool = False,
        alert_only: bool = False,
    ) -> List[Dict[str, Any]]:
        # If Firestore is enabled, we could fetch from DB. 
        # But for live speed, we return from cache.
        # For historical deep-dives, we will use Firestore.
        results = list(self._cache)
        results.reverse()

        if fault_only:
            results = [r for r in results if r.get("pipeline", {}).get("fault_predicted") is True]
        if alert_only:
            results = [r for r in results if r.get("latent_alert", {}).get("anomaly_detected") is True]

        return results[:limit]

    def get_by_id(self, record_id: str) -> Optional[Dict[str, Any]]:
        # 1. Check cache first
        for r in self._cache:
            if r["id"] == record_id:
                return r
        
        # 2. Check Firestore if not in cache
        if db_client.enabled:
            doc = db_client.db.collection(self.collection_name).document(record_id).get()
            if doc.exists:
                return doc.to_dict()
                
        return None

    def update_status(self, record_id: str, status: str) -> bool:
        # Update cache
        for r in self._cache:
            if r["id"] == record_id:
                r["status"] = status
                break
        
        # Update Firestore
        if db_client.enabled:
            try:
                db_client.db.collection(self.collection_name).document(record_id).update({"status": status})
                return True
            except Exception as e:
                print(f"Failed to update Firestore status: {e}")
        return False

    def get_summary(self) -> Dict[str, Any]:
        results = list(self._cache)
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
        self._cache.clear()

# Singleton
result_store = ResultStore()
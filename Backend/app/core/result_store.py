import time
from collections import deque
from datetime import datetime
from typing import Dict, Any, List, Optional
import uuid

from app.core.db import db_client

class ResultStore:
    def __init__(self, max_size: int = 1000):
        self._cache: deque = deque(maxlen=max_size)
        self.collection_name = "pipeline_results"
        self._last_quota_error_time = 0
        self._quota_retry_delay = 300  # Wait 5 minutes after a quota error before trying Firestore again

    def _can_use_firestore(self) -> bool:
        if not db_client.enabled:
            return False
        
        # If we had a quota error recently, skip Firestore to keep the pipeline fast
        if time.time() - self._last_quota_error_time < self._quota_retry_delay:
            return False
            
        return True

    def _handle_firestore_error(self, e: Exception):
        err_msg = str(e).lower()
        if "quota" in err_msg or "429" in err_msg or "resource_exhausted" in err_msg:
            print(f"⚠️ Firestore Quota Exceeded. Disabling cloud persistence for {self._quota_retry_delay}s to maintain stream speed.")
            self._last_quota_error_time = time.time()
        else:
            print(f"Failed to communicate with Firestore: {e}")

    def save(self, result: Dict[str, Any]) -> str:
        record_id = str(uuid.uuid4())
        record = {
            "id": record_id,
            "timestamp": datetime.now().isoformat(),
            "status": "pending",
            **result,
        }
        
        # Save to memory cache (ALWAYS works, even if cloud is down/over-quota)
        self._cache.append(record)
        
        # Save to Firestore if enabled AND a fault/anomaly is detected
        is_fault = result.get("pipeline", {}).get("fault_predicted", False)
        is_anomaly = result.get("latent_alert", {}).get("anomaly_detected", False)
        
        if self._can_use_firestore() and (is_fault or is_anomaly):
            try:
                # Add a short timeout (2s) so we don't hang the real-time stream
                db_client.db.collection(self.collection_name).document(record_id).set(record, timeout=2.0)
            except Exception as e:
                self._handle_firestore_error(e)
                
        return record_id

    def get_all(
        self,
        limit: int = 100,
        fault_only: bool = False,
        alert_only: bool = False,
    ) -> List[Dict[str, Any]]:
        # Start with in-memory cache (newest first)
        cache_results = list(self._cache)
        cache_results.reverse()

        # If Firestore is available and cache has fewer records than requested,
        # supplement from Firestore to fill up to `limit`
        if self._can_use_firestore() and len(cache_results) < limit:
            try:
                query = db_client.db.collection(self.collection_name)\
                    .order_by("timestamp", direction="DESCENDING")\
                    .limit(limit)
                
                # Fetch with timeout
                fs_docs = query.stream(timeout=3.0)
                cache_ids = {r["id"] for r in cache_results}
                
                for doc in fs_docs:
                    data = doc.to_dict()
                    if data and data.get("id") not in cache_ids:
                        cache_results.append(data)
                        cache_ids.add(data["id"])

                # Re-sort merged list by timestamp descending
                cache_results.sort(
                    key=lambda r: r.get("timestamp", ""),
                    reverse=True
                )
            except Exception as e:
                self._handle_firestore_error(e)

        # Apply filters
        results = cache_results
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
        if self._can_use_firestore():
            try:
                doc = db_client.db.collection(self.collection_name).document(record_id).get(timeout=2.0)
                if doc.exists:
                    return doc.to_dict()
            except Exception as e:
                self._handle_firestore_error(e)
                
        return None

    def update_status(self, record_id: str, status: str) -> bool:
        # Update cache
        for r in self._cache:
            if r["id"] == record_id:
                r["status"] = status
                break
        
        # Update Firestore
        if self._can_use_firestore():
            try:
                db_client.db.collection(self.collection_name).document(record_id).update({"status": status}, timeout=2.0)
                return True
            except Exception as e:
                self._handle_firestore_error(e)
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

import asyncio
import json
import pandas as pd
from collections import deque
from itertools import cycle
from typing import List
import traceback

class StreamManager:
    def __init__(self):
        self.queues: List[asyncio.Queue] = []
        self.is_running = False
        self._task = None
        self._load_history = deque(maxlen=60)

    async def add_client(self) -> asyncio.Queue:
        q = asyncio.Queue()
        self.queues.append(q)
        if not self.is_running:
            self.start_stream()
        return q

    def remove_client(self, q: asyncio.Queue):
        if q in self.queues:
            self.queues.remove(q)
        if not self.queues:
            self.stop_stream()

    def start_stream(self):
        if not self.is_running:
            self.is_running = True
            self._load_history.clear()
            self._task = asyncio.create_task(self._producer())

    def stop_stream(self):
        self.is_running = False
        if self._task:
            self._task.cancel()
            self._task = None

    def _build_payload(self, row, load_history=None):
        return {
            "fault_prediction": {
                "KW_Plus": row.get("KW_Plus", 0),
                "Avg_Current": row.get("Avg_Current", 0),
                "Average_PF": row.get("Average_PF", 0),
                "Avg_Voltage": row.get("Avg_Voltage", 0),
                "I_imbalance": row.get("I_imbalance", 0),
                "V_imbalance": row.get("V_imbalance", 0),
                "current_magnitude": row.get("current_magnitude", 0),
                "zero_seq": row.get("zero_seq", 0),
                "I_imbalance_diff": row.get("I_imbalance_diff", 0),
                "hour": int(row.get("hour", 0)),
                "dayofweek": int(row.get("dayofweek", 0)),
                "is_night": int(row.get("is_night", 0)),
                "I_imbalance_rmean_4": row.get("I_imbalance_rmean_4", 0),
                "I_imbalance_rstd_4": row.get("I_imbalance_rstd_4", 0),
                "curr_mag_rmean_4": row.get("curr_mag_rmean_4", 0),
                "I_imbalance_rmean_8": row.get("I_imbalance_rmean_8", 0),
                "I_imbalance_rstd_8": row.get("I_imbalance_rstd_8", 0),
                "curr_mag_rmean_8": row.get("curr_mag_rmean_8", 0),
                "I_imbalance_rmean_12": row.get("I_imbalance_rmean_12", 0),
                "I_imbalance_rstd_12": row.get("I_imbalance_rstd_12", 0),
                "curr_mag_rmean_12": row.get("curr_mag_rmean_12", 0),
                "I_lag_1": row.get("I_lag_1", 0),
                "curr_lag_1": row.get("curr_lag_1", 0),
                "I_lag_2": row.get("I_lag_2", 0),
                "curr_lag_2": row.get("curr_lag_2", 0),
                "I_lag_3": row.get("I_lag_3", 0),
                "curr_lag_3": row.get("curr_lag_3", 0),
                "I_lag_4": row.get("I_lag_4", 0),
                "curr_lag_4": row.get("curr_lag_4", 0),
                "I_lag_8": row.get("I_lag_8", 0),
                "curr_lag_8": row.get("curr_lag_8", 0)
            },
            "latent_alert": {
                "feeder_load": row.get("feeder_load", 0),
                "temperature": row.get("temperature", 0),
                "humidity": row.get("humidity", 0),
                "wind_speed": row.get("wind_speed", 0),
                "precipitation": row.get("precipitation", 0),
                "is_rain": int(row.get("is_rain", 0)),
                "hour": int(row.get("hour", 0)),
                "month": int(row.get("month", 0)),
                "dayofweek": int(row.get("dayofweek", 0)),
                "is_weekend": int(row.get("is_weekend", 0)),
                "is_peak_hour": int(row.get("is_peak_hour", 0)),
                "is_night": int(row.get("is_night", 0)),
                "season": row.get("season", "unknown"),
                "temp_bucket": row.get("temp_bucket", "unknown"),
                "baseline_mean": row.get("baseline_mean", 0),
                "baseline_std": row.get("baseline_std", 0),
                "load_history": load_history or []
            },
            "fault_classification": {
                "Ia": row.get("Ia", 0),
                "Ib": row.get("Ib", 0),
                "Ic": row.get("Ic", 0),
                "Va": row.get("Va", 0),
                "Vb": row.get("Vb", 0),
                "Vc": row.get("Vc", 0)
            },
            "localization": {
                "V1": row.get("V1", 0),
                "V2": row.get("V2", 0),
                "V3": row.get("V3", 0),
                "I1": row.get("I1", 0),
                "I2": row.get("I2", 0),
                "I3": row.get("I3", 0)
            }
        }

    async def _producer(self):
        try:
            # Import here to avoid circular imports during startup
            from app.routers.predict import run_full_pipeline
            from app.schemas.schemas import FullPipelineInput
            
            print("Producer started, reading CSV...")
            df = pd.read_csv("data/unified_pipeline_stream.csv")
            
            # Convert timestamp to string if present so it's JSON serializable
            if 'timestamp' in df.columns:
                df['timestamp'] = df['timestamp'].astype(str)
                
            row_iterator = cycle(df.to_dict('records'))
            
            count = 1
            for row in row_iterator:
                if not self.is_running:
                    print("Producer stopped.")
                    break
                
                try:
                    try:
                        self._load_history.append(float(row.get("feeder_load", 0)))
                    except Exception:
                        self._load_history.append(0.0)

                    payload_dict = self._build_payload(row, load_history=list(self._load_history))
                    payload_obj = FullPipelineInput(**payload_dict)
                    
                    # Run inference pipeline using threadpool if blocking, but it's fast enough
                    # For safety, using asyncio.to_thread
                    prediction_result = await asyncio.to_thread(run_full_pipeline, payload_obj)
                    
                    full_result = {
                        "count": count,
                        "raw_data": row,
                        "prediction": prediction_result
                    }
                    
                    message = json.dumps(full_result)
                    
                    # Push to all client queues
                    for q in self.queues:
                        # only put if queue size is reasonable to avoid unbounded growth
                        if q.qsize() < 100:
                            await q.put(message)
                    
                    count += 1
                    
                except Exception as e:
                    print(f"Error processing row: {e}")
                    traceback.print_exc()
                
                await asyncio.sleep(1.0)  # Configurable delay
                
        except asyncio.CancelledError:
            print("Producer task cancelled.")
        except Exception as e:
            print(f"Producer fatal error: {e}")
            traceback.print_exc()
            self.is_running = False

stream_manager = StreamManager()

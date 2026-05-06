import time
import json
import requests
import pandas as pd
from itertools import cycle

# Configuration
CSV_PATH = "data/unified_pipeline_stream.csv"
API_URL = "http://127.0.0.1:8000/predict/pipeline"
DELAY_SECONDS = 1.0  # Time to wait between requests

def build_payload(row):
    """Map CSV row to the FullPipelineInput schema expected by the API."""
    return {
        "fault_prediction": {
            "KW_Plus": row["KW_Plus"],
            "Avg_Current": row["Avg_Current"],
            "Average_PF": row["Average_PF"],
            "Avg_Voltage": row["Avg_Voltage"],
            "I_imbalance": row["I_imbalance"],
            "V_imbalance": row["V_imbalance"],
            "current_magnitude": row["current_magnitude"],
            "zero_seq": row["zero_seq"],
            "I_imbalance_diff": row["I_imbalance_diff"],
            "hour": int(row["hour"]),
            "dayofweek": int(row["dayofweek"]),
            "is_night": int(row["is_night"]),
            "I_imbalance_rmean_4": row["I_imbalance_rmean_4"],
            "I_imbalance_rstd_4": row["I_imbalance_rstd_4"],
            "curr_mag_rmean_4": row["curr_mag_rmean_4"],
            "I_imbalance_rmean_8": row["I_imbalance_rmean_8"],
            "I_imbalance_rstd_8": row["I_imbalance_rstd_8"],
            "curr_mag_rmean_8": row["curr_mag_rmean_8"],
            "I_imbalance_rmean_12": row["I_imbalance_rmean_12"],
            "I_imbalance_rstd_12": row["I_imbalance_rstd_12"],
            "curr_mag_rmean_12": row["curr_mag_rmean_12"],
            "I_lag_1": row["I_lag_1"],
            "curr_lag_1": row["curr_lag_1"],
            "I_lag_2": row["I_lag_2"],
            "curr_lag_2": row["curr_lag_2"],
            "I_lag_3": row["I_lag_3"],
            "curr_lag_3": row["curr_lag_3"],
            "I_lag_4": row["I_lag_4"],
            "curr_lag_4": row["curr_lag_4"],
            "I_lag_8": row["I_lag_8"],
            "curr_lag_8": row["curr_lag_8"]
        },
        "latent_alert": {
            "feeder_load": row["feeder_load"],
            "temperature": row["temperature"],
            "humidity": row["humidity"],
            "wind_speed": row["wind_speed"],
            "precipitation": row["precipitation"],
            "is_rain": int(row["is_rain"]),
            "hour": int(row["hour"]),
            "month": int(row["month"]),
            "dayofweek": int(row["dayofweek"]),
            "is_weekend": int(row["is_weekend"]),
            "is_peak_hour": int(row["is_peak_hour"]),
            "is_night": int(row["is_night"]),
            "season": row["season"],
            "temp_bucket": row["temp_bucket"],
            "baseline_mean": row["baseline_mean"],
            "baseline_std": row["baseline_std"]
        },
        "fault_classification": {
            "Ia": row["Ia"],
            "Ib": row["Ib"],
            "Ic": row["Ic"],
            "Va": row["Va"],
            "Vb": row["Vb"],
            "Vc": row["Vc"]
        },
        "localization": {
            "V1": row["V1"],
            "V2": row["V2"],
            "V3": row["V3"],
            "I1": row["I1"],
            "I2": row["I2"],
            "I3": row["I3"]
        }
    }

def stream_data():
    print(f"Loading data from {CSV_PATH}...")
    df = pd.read_csv(CSV_PATH)
    
    # We use itertools.cycle to loop through the dataframe infinitely
    row_iterator = cycle(df.to_dict('records'))
    
    print(f"Starting continuous stream to {API_URL} (Press Ctrl+C to stop)")
    
    try:
        count = 1
        for row in row_iterator:
            payload = build_payload(row)
            
            try:
                # Send the POST request to the inference pipeline
                response = requests.post(API_URL, json=payload, timeout=5)
                
                print(f"[{count}] [{row['timestamp']}] Pipeline Status: {response.status_code}")
                
                # If you want to print the response result, uncomment this line:
                # print(json.dumps(response.json(), indent=2))
                
            except requests.exceptions.ConnectionError:
                print(f"[{count}] ERROR: Could not connect to API at {API_URL}. Is the server running?")
            except Exception as e:
                print(f"[{count}] ERROR: {str(e)}")
            
            count += 1
            time.sleep(DELAY_SECONDS)
            
    except KeyboardInterrupt:
        print("\nStreaming stopped by user.")

if __name__ == "__main__":
    stream_data()

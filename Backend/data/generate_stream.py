import pandas as pd
import numpy as np
from datetime import datetime, timedelta

def main():
    print("Loading datasets...")
    # Load the datasets
    fp_df = pd.read_csv("Fault_prdiction_dataset.csv").dropna(subset=["KW_Plus", "Avg_Current", "Average_PF", "Avg_Voltage"])
    la_df = pd.read_csv("karachi_feeder_v3.csv")
    fc_df = pd.read_csv("classData.csv")
    loc_df = pd.read_csv("power_fault_single_phase_20000 (2).csv")
    
    print("Generating unified stream...")
    # We will generate a time series of N records. Let's say N=1000 for continuous testing.
    N = 1000
    
    # Base datetime
    start_time = datetime(2024, 1, 1, 0, 0, 0)
    timestamps = [start_time + timedelta(minutes=15 * i) for i in range(N)]
    
    # Sample from each dataset
    fp_sample = fp_df.sample(n=N, replace=True).reset_index(drop=True)
    la_sample = la_df.sample(n=N, replace=True).reset_index(drop=True)
    fc_sample = fc_df.sample(n=N, replace=True).reset_index(drop=True)
    loc_sample = loc_df.sample(n=N, replace=True).reset_index(drop=True)
    
    # Combine into a single dataframe
    stream_df = pd.DataFrame()
    stream_df["timestamp"] = timestamps
    
    # Fault Prediction cols
    fp_cols = [
        "KW_Plus", "Avg_Current", "Average_PF", "Avg_Voltage",
        "I_imbalance", "V_imbalance", "current_magnitude", "zero_seq",
        "I_imbalance_diff", "hour", "dayofweek", "is_night",
        "I_imbalance_rmean_4", "I_imbalance_rstd_4", "curr_mag_rmean_4",
        "I_imbalance_rmean_8", "I_imbalance_rstd_8", "curr_mag_rmean_8",
        "I_imbalance_rmean_12", "I_imbalance_rstd_12", "curr_mag_rmean_12",
        "I_lag_1", "curr_lag_1", "I_lag_2", "curr_lag_2",
        "I_lag_3", "curr_lag_3", "I_lag_4", "curr_lag_4",
        "I_lag_8", "curr_lag_8"
    ]
    for col in fp_cols:
        if col in fp_sample.columns:
            stream_df[col] = fp_sample[col]
        else:
            stream_df[col] = 0.0
            
    # Latent Alert cols
    la_cols = [
        "feeder_load", "temperature", "humidity", "wind_speed", "precipitation",
        "is_rain", "is_weekend", "is_peak_hour", "season", "temp_bucket",
        "baseline_mean", "baseline_std"
    ]
    for col in la_cols:
        if col in la_sample.columns:
            stream_df[col] = la_sample[col]
        else:
            if col in ["season", "temp_bucket"]:
                stream_df[col] = "summer" if col == "season" else "warm"
            else:
                stream_df[col] = 0.0
            
    # Time features (override with actual timestamp data)
    stream_df["hour"] = [t.hour for t in timestamps]
    stream_df["dayofweek"] = [t.weekday() for t in timestamps]
    stream_df["month"] = [t.month for t in timestamps]
    stream_df["is_night"] = stream_df["hour"].apply(lambda h: 1 if h < 6 or h > 18 else 0)
            
    # Fault Classification cols
    fc_cols = ["Ia", "Ib", "Ic", "Va", "Vb", "Vc"]
    for col in fc_cols:
        if col in fc_sample.columns:
            stream_df[col] = fc_sample[col]
        else:
            stream_df[col] = 0.0
            
    # Localization cols
    loc_cols = ["V1", "V2", "V3", "I1", "I2", "I3"]
    for col in loc_cols:
        if col in loc_sample.columns:
            stream_df[col] = loc_sample[col]
        else:
            stream_df[col] = 0.0

    # Handle NaN values to avoid errors during prediction
    stream_df = stream_df.fillna(0.0)
    
    # Save to a new unified CSV
    out_file = "unified_pipeline_stream.csv"
    stream_df.to_csv(out_file, index=False)
    print(f"Unified stream generated: {out_file} ({len(stream_df)} records)")

if __name__ == "__main__":
    main()

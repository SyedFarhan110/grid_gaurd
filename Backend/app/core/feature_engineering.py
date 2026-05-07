"""
Feature engineering helpers for each ML module.
Each function takes raw input data and returns a DataFrame ready for model.predict().
"""

import numpy as np
import pandas as pd
from typing import Dict, Any


# ── 1. FAULT PREDICTION FEATURES ───────────────────────────────────────────────
FAULT_PREDICTION_FEATURES = [
    "KW_Plus", "Avg_Current", "Average_PF", "Avg_Voltage",
    "I_imbalance", "V_imbalance", "current_magnitude", "zero_seq",
    "I_imbalance_diff", "hour", "dayofweek", "is_night",
    "I_imbalance_rmean_4", "I_imbalance_rstd_4", "curr_mag_rmean_4",
    "I_imbalance_rmean_8", "I_imbalance_rstd_8", "curr_mag_rmean_8",
    "I_imbalance_rmean_12", "I_imbalance_rstd_12", "curr_mag_rmean_12",
    "I_lag_1", "curr_lag_1", "I_lag_2", "curr_lag_2",
    "I_lag_3", "curr_lag_3", "I_lag_4", "curr_lag_4",
    "I_lag_8", "curr_lag_8",
]


def prepare_fault_prediction_features(data: Dict[str, Any]) -> pd.DataFrame:
    """
    Accepts a dict with the 31 required features for the XGBoost fault prediction model.
    """
    df = pd.DataFrame([data])
    for col in FAULT_PREDICTION_FEATURES:
        if col not in df.columns:
            df[col] = 0.0
    return df[FAULT_PREDICTION_FEATURES].astype(float)


# ── 2. FAULT CLASSIFICATION FEATURES ───────────────────────────────────────────
FAULT_CLASSIFICATION_RAW = ["Ia", "Ib", "Ic", "Va", "Vb", "Vc"]


def prepare_fault_classification_features(data: Dict[str, Any]) -> pd.DataFrame:
    """
    Raw phase currents and voltages.
    The Pipeline's FeatureEngineer step handles all derived features internally.
    Input: Ia, Ib, Ic, Va, Vb, Vc
    """
    df = pd.DataFrame([data])
    for col in FAULT_CLASSIFICATION_RAW:
        if col not in df.columns:
            raise ValueError(
                f"Missing required field: '{col}'. Need: Ia, Ib, Ic, Va, Vb, Vc."
            )
    return df[FAULT_CLASSIFICATION_RAW].astype(float)


# ── 3. FAULT LOCALIZATION FEATURES ─────────────────────────────────────────────
# Raw inputs
LOCALIZATION_RAW = ["V1", "V2", "V3", "I1", "I2", "I3"]

# Final 11-feature set confirmed against the RandomForest model (n_features_in_=11)
# 6 raw + 4 domain-derived (provided by you) + 1 statistical (I_avg)
LOCALIZATION_FEATURES = [
    "V1", "V2", "V3", "I1", "I2", "I3",
    "V_ratio",    # V3 / V1        — voltage sag ratio (fault severity indicator)
    "I_ratio",    # I1 / (I2+I3)  — current asymmetry (fault phase detection)
    "V_drop",     # V1 - V3        — voltage drop across the line
    "Z_apparent", # V3 / I1        — apparent impedance (distance proxy)
    "I_avg",      # (I1+I2+I3)/3   — average current magnitude
]


def prepare_localization_features(data: Dict[str, Any]) -> pd.DataFrame:
    """
    Computes the 11 features for substation classification and distance regression.

    Raw inputs required: V1, V2, V3, I1, I2, I3

    Derived features added:
      V_ratio    = V3 / V1            (voltage sag ratio)
      I_ratio    = I1 / (I2 + I3)    (current asymmetry)
      V_drop     = V1 - V3            (voltage drop across feeder)
      Z_apparent = V3 / I1            (apparent impedance — distance proxy)
      I_avg      = (I1 + I2 + I3) / 3
    """
    df = pd.DataFrame([data])
    for col in LOCALIZATION_RAW:
        if col not in df.columns:
            raise ValueError(
                f"Missing required field: '{col}'. Need: V1, V2, V3, I1, I2, I3."
            )

    df["V_ratio"]    = df["V3"] / df["V1"].replace(0, 1e-6)
    df["I_ratio"]    = df["I1"] / (df["I2"] + df["I3"] + 1e-6)
    df["V_drop"]     = df["V1"] - df["V3"]
    df["Z_apparent"] = df["V3"] / (df["I1"] + 1e-6)
    df["I_avg"]      = (df["I1"] + df["I2"] + df["I3"]) / 3

    return df[LOCALIZATION_FEATURES].astype(float)


# ── 4. LATENT ALERT DETECTION FEATURES ─────────────────────────────────────────
LATENT_ALERT_FEATURES = [
    "feeder_load", "load_above_baseline", "load_below_baseline",
    "load_vs_baseline_pct", "baseline_mean", "baseline_std",
    "load_diff_1", "load_diff_5", "load_diff_15",
    "load_abs_diff_1",
    "load_lag_1", "load_lag_3", "load_lag_5", "load_lag_10",
    "load_lag_15", "load_lag_30", "load_lag_60",
    "roll_mean_5", "roll_mean_10", "roll_mean_15", "roll_mean_30", "roll_mean_60",
    "roll_std_5", "roll_std_10", "roll_std_15", "roll_std_30", "roll_std_60",
    "roll_range_5", "roll_range_10",
    "temperature", "humidity", "wind_speed", "precipitation",
    "is_rain", "apparent_temp", "heat_load_ratio", "humidity_load_ratio",
    "temp_x_load", "temp_x_humidity",
    "is_extreme_heat", "heat_peak",
    "hour_sin", "hour_cos", "month_sin", "month_cos",
    "dow_sin", "dow_cos",
    "is_weekend", "is_peak_hour", "is_night",
    "season_enc", "temp_bucket_enc",
]

SEASON_ENC     = {"winter": 0, "spring": 1, "summer": 2, "monsoon": 3, "autumn": 4}
TEMP_BUCKET_ENC = {"cold": 0, "cool": 0, "mild": 1, "warm": 2, "hot": 3, "extreme": 4}


def prepare_latent_alert_features(data: Dict[str, Any]) -> pd.DataFrame:
    df   = pd.DataFrame([data])
    fl   = float(data.get("feeder_load", 0))
    hour = int(data.get("hour", 0))
    month = int(data.get("month", 1))
    dow   = int(data.get("dayofweek", 0))
    temp  = float(data.get("temperature", 30))
    hum   = float(data.get("humidity", 60))

    # Cyclical encodings — same as before ✅
    df["hour_sin"]  = np.sin(2 * np.pi * hour  / 24)
    df["hour_cos"]  = np.cos(2 * np.pi * hour  / 24)
    df["month_sin"] = np.sin(2 * np.pi * month / 12)
    df["month_cos"] = np.cos(2 * np.pi * month / 12)
    df["dow_sin"]   = np.sin(2 * np.pi * dow   / 7)
    df["dow_cos"]   = np.cos(2 * np.pi * dow   / 7)

    df["season_enc"]      = SEASON_ENC.get(str(data.get("season", "summer")).lower(), 2)
    df["temp_bucket_enc"] = TEMP_BUCKET_ENC.get(str(data.get("temp_bucket", "warm")).lower(), 2)

    # FIX: compute is_night server-side — never trust client value
    df["is_night"] = 1 if (hour >= 22 or hour < 6) else 0

    baseline_mean = float(data.get("baseline_mean") or fl * 0.9)
    baseline_std  = float(data.get("baseline_std")  or fl * 0.1)

    # FIX: compute time-series features from load_history if provided
    load_history = data.get("load_history")
    if load_history and len(load_history) >= 2:
        hist = pd.Series(load_history, dtype=float)
        lag_map   = {1:1, 3:3, 5:5, 10:10, 15:15, 30:30, 60:60}
        roll_wins = [5, 10, 15, 30, 60]
        for lag, shift in lag_map.items():
            df[f"load_lag_{lag}"] = float(hist.iloc[-shift]) if len(hist) > shift else fl
        for win in roll_wins:
            sl = hist.iloc[-win:]
            df[f"roll_mean_{win}"] = float(sl.mean())
            df[f"roll_std_{win}"]  = float(sl.std()) if len(sl) > 1 else 0.0
        for win in [5, 10]:
            sl = hist.iloc[-win:]
            df[f"roll_range_{win}"] = float(sl.max() - sl.min()) if len(sl) > 1 else 0.0
        for d in [1, 5, 15]:
            df[f"load_diff_{d}"]  = fl - float(hist.iloc[-d]) if len(hist) > d else 0.0
        df["load_abs_diff_1"] = abs(float(df["load_diff_1"].iloc[0]))
    else:
        # fallback: all lags = current fl, all diffs/stds = 0
        for lag in [1,3,5,10,15,30,60]:
            df[f"load_lag_{lag}"] = fl
        for win in [5,10,15,30,60]:
            df[f"roll_mean_{win}"] = fl
            df[f"roll_std_{win}"]  = 0.0
        for win in [5,10]:
            df[f"roll_range_{win}"] = 0.0
        for d in [1,5,15]:
            df[f"load_diff_{d}"] = 0.0
        df["load_abs_diff_1"] = 0.0

    defaults = {
        "load_above_baseline":   max(0.0, fl - baseline_mean),
        "load_below_baseline":   max(0.0, baseline_mean - fl),
        "load_vs_baseline_pct":  ((fl - baseline_mean) / (baseline_mean + 1e-6)) * 100,
        "baseline_mean":  baseline_mean,
        "baseline_std":   baseline_std,
        "apparent_temp":         temp + 0.33 * hum / 100 * 6.1078 - 4,
        "heat_load_ratio":       fl  / (temp + 1e-6),
        "humidity_load_ratio":   fl  / (hum  + 1e-6),
        "temp_x_load":           fl  * temp,
        "temp_x_humidity":       temp * hum,
        "is_extreme_heat":       1 if temp > 42 else 0,
        "heat_peak":             1 if (temp > 38 and hour in range(12, 18)) else 0,
    }
    for col, val in defaults.items():
        if col not in df.columns:
            df[col] = val

    for col in LATENT_ALERT_FEATURES:
        if col not in df.columns:
            df[col] = 0.0

    return df[LATENT_ALERT_FEATURES].astype(float)
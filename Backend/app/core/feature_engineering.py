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


def prepare_latent_alert_features(data: dict) -> pd.DataFrame:
    df = pd.DataFrame([data])

    def _clean_history(values):
        cleaned = []
        for value in values or []:
            try:
                numeric = float(value)
            except Exception:
                continue
            if np.isfinite(numeric):
                cleaned.append(numeric)
        return cleaned

    def _lag_value(history, lag, fallback):
        return history[-lag] if len(history) >= lag else fallback

    def _window_stats(history, window, fallback):
        window_values = history[-window:] if len(history) >= window else history
        if not window_values:
            return fallback, 0.0, 0.0
        return (
            float(np.mean(window_values)),
            float(np.std(window_values)) if len(window_values) > 1 else 0.0,
            float(np.max(window_values) - np.min(window_values)),
        )

    fl = float(data.get("feeder_load", 0.0))
    bm = float(data.get("baseline_mean") if data.get("baseline_mean") is not None else fl)
    bs = max(float(data.get("baseline_std") if data.get("baseline_std") is not None else 1.0), 0.01)
    temp = float(data.get("temperature", 25.0))
    hum = float(data.get("humidity", 60.0))
    wind = float(data.get("wind_speed", 0.0))
    precipitation = float(data.get("precipitation", 0.0))
    hour = int(data.get("hour", 0))
    month = int(data.get("month", 1))
    dayofweek = int(data.get("dayofweek", 0))
    history = _clean_history(data.get("load_history"))

    hour_angle = 2 * np.pi * (hour % 24) / 24.0
    month_angle = 2 * np.pi * (month % 12) / 12.0
    dow_angle = 2 * np.pi * (dayofweek % 7) / 7.0

    load_lag_1 = _lag_value(history, 1, fl)
    load_lag_3 = _lag_value(history, 3, fl)
    load_lag_5 = _lag_value(history, 5, fl)
    load_lag_10 = _lag_value(history, 10, fl)
    load_lag_15 = _lag_value(history, 15, fl)
    load_lag_30 = _lag_value(history, 30, fl)
    load_lag_60 = _lag_value(history, 60, fl)

    roll_mean_5, roll_std_5, roll_range_5 = _window_stats(history, 5, fl)
    roll_mean_10, roll_std_10, roll_range_10 = _window_stats(history, 10, fl)
    roll_mean_15, roll_std_15, _ = _window_stats(history, 15, fl)
    roll_mean_30, roll_std_30, _ = _window_stats(history, 30, fl)
    roll_mean_60, roll_std_60, _ = _window_stats(history, 60, fl)

    df["feeder_load"] = fl
    df["load_above_baseline"] = max(fl - bm, 0.0)
    df["load_below_baseline"] = max(bm - fl, 0.0)
    df["load_vs_baseline_pct"] = ((fl - bm) / max(bm, 0.01)) * 100.0
    df["baseline_mean"] = bm
    df["baseline_std"] = bs
    df["load_diff_1"] = fl - load_lag_1
    df["load_diff_5"] = fl - load_lag_5
    df["load_diff_15"] = fl - load_lag_15
    df["load_abs_diff_1"] = abs(fl - load_lag_1)
    df["load_lag_1"] = load_lag_1
    df["load_lag_3"] = load_lag_3
    df["load_lag_5"] = load_lag_5
    df["load_lag_10"] = load_lag_10
    df["load_lag_15"] = load_lag_15
    df["load_lag_30"] = load_lag_30
    df["load_lag_60"] = load_lag_60
    df["roll_mean_5"] = roll_mean_5
    df["roll_mean_10"] = roll_mean_10
    df["roll_mean_15"] = roll_mean_15
    df["roll_mean_30"] = roll_mean_30
    df["roll_mean_60"] = roll_mean_60
    df["roll_std_5"] = roll_std_5
    df["roll_std_10"] = roll_std_10
    df["roll_std_15"] = roll_std_15
    df["roll_std_30"] = roll_std_30
    df["roll_std_60"] = roll_std_60
    df["roll_range_5"] = roll_range_5
    df["roll_range_10"] = roll_range_10
    df["temperature"] = temp
    df["humidity"] = hum
    df["wind_speed"] = wind
    df["precipitation"] = precipitation
    df["is_rain"] = int(float(data.get("is_rain", 0)) > 0)
    df["apparent_temp"] = temp + 0.33 * (hum / 100 * 6.105 * np.exp(17.27 * temp / (237.7 + temp))) - 4.0
    df["heat_load_ratio"] = (fl * temp) / max(bm * 32, 1.0)
    df["humidity_load_ratio"] = (fl * hum) / max(bm * 66, 1.0)
    df["temp_x_load"] = temp * fl
    df["temp_x_humidity"] = temp * hum
    df["is_extreme_heat"] = int(temp >= 38)
    df["heat_peak"] = df["is_extreme_heat"].iloc[0] * int(data.get("is_peak_hour", 0))
    df["hour_sin"] = np.sin(hour_angle)
    df["hour_cos"] = np.cos(hour_angle)
    df["month_sin"] = np.sin(month_angle)
    df["month_cos"] = np.cos(month_angle)
    df["dow_sin"] = np.sin(dow_angle)
    df["dow_cos"] = np.cos(dow_angle)
    df["is_weekend"] = int(data.get("is_weekend", 0))
    df["is_peak_hour"] = int(data.get("is_peak_hour", 0))
    df["is_night"] = int(data.get("is_night", hour >= 22 or hour < 6))
    df["season_enc"] = SEASON_ENC.get(str(data.get("season", "")).lower(), 0)
    df["temp_bucket_enc"] = TEMP_BUCKET_ENC.get(str(data.get("temp_bucket", "")).lower(), 1)

    for col in LATENT_ALERT_FEATURES:
        if col not in df.columns:
            df[col] = 0.0

    return df[LATENT_ALERT_FEATURES].astype(float)
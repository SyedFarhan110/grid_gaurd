"""
FYDP API Test Script
Run this to verify all endpoints work correctly.

Usage:
    # Start server first: uvicorn app.main:app --reload
    python test_api.py
"""

import requests
import json

BASE = "http://localhost:8000"

def print_result(title, r):
    print(f"\n{'='*60}")
    print(f"  {title}")
    print(f"  Status: {r.status_code}")
    print(f"{'='*60}")
    try:
        print(json.dumps(r.json(), indent=2))
    except:
        print(r.text)


# ── 1. Health Check ────────────────────────────────────────────
r = requests.get(f"{BASE}/health")
print_result("HEALTH CHECK", r)

# ── 2. Model Status ────────────────────────────────────────────
r = requests.get(f"{BASE}/models/status")
print_result("MODEL STATUS", r)

# ── 3. Fault Prediction Only ───────────────────────────────────
fault_input = {
    "KW_Plus": 4237.1,
    "Avg_Current": 152.3,
    "Average_PF": 0.87,
    "Avg_Voltage": 220.0,
    "I_imbalance": 0.18,      # High imbalance → likely fault
    "V_imbalance": 0.12,
    "current_magnitude": 263.4,
    "zero_seq": 2.8,
    "I_imbalance_diff": 0.05,
    "hour": 14,
    "dayofweek": 2,
    "is_night": 0,
    "I_imbalance_rmean_4": 0.15,
    "I_imbalance_rstd_4": 0.03,
    "curr_mag_rmean_4": 260.0,
    "I_imbalance_rmean_8": 0.14,
    "I_imbalance_rstd_8": 0.04,
    "curr_mag_rmean_8": 258.0,
    "I_imbalance_rmean_12": 0.13,
    "I_imbalance_rstd_12": 0.035,
    "curr_mag_rmean_12": 255.0,
    "I_lag_1": 0.17,
    "curr_lag_1": 262.0,
    "I_lag_2": 0.16,
    "curr_lag_2": 261.0,
    "I_lag_3": 0.15,
    "curr_lag_3": 260.0,
    "I_lag_4": 0.14,
    "curr_lag_4": 258.0,
    "I_lag_8": 0.12,
    "curr_lag_8": 255.0,
}

r = requests.post(f"{BASE}/predict/fault", json=fault_input)
print_result("FAULT PREDICTION", r)

# ── 4. Fault Classification Only ───────────────────────────────
classify_input = {
    "Ia": -151.29,
    "Ib": -9.68,
    "Ic": 85.80,
    "Va": 0.40,
    "Vb": -0.13,
    "Vc": -0.27,
}

r = requests.post(f"{BASE}/predict/classify", json=classify_input)
print_result("FAULT CLASSIFICATION", r)

# ── 5. Localization Only ───────────────────────────────────────
localize_input = {
    "V1": 33.188,
    "V2": 33.993,
    "V3": 33.500,
    "I1": 120.5,
    "I2": 118.2,
    "I3": 121.0,
}

r = requests.post(f"{BASE}/predict/localize", json=localize_input)
print_result("FAULT LOCALIZATION", r)

# ── 6. Latent Alert Only ───────────────────────────────────────
latent_input = {
    "feeder_load": 18.5,      # High load
    "hour": 14,
    "month": 7,
    "dayofweek": 2,
    "temperature": 44.0,      # Extreme heat
    "humidity": 75.0,
    "wind_speed": 5.0,
    "precipitation": 0.0,
    "is_rain": 0,
    "is_weekend": 0,
    "is_peak_hour": 1,
    "is_night": 0,
    "season": "summer",
    "temp_bucket": "extreme",
    "baseline_mean": 10.0,
    "baseline_std": 1.5,
}

r = requests.post(f"{BASE}/predict/latent-alert", json=latent_input)
print_result("LATENT ALERT DETECTION", r)

# ── 7. Full Pipeline ───────────────────────────────────────────
pipeline_input = {
    "fault_prediction": fault_input,
    "latent_alert": latent_input,
    "fault_classification": classify_input,
    "localization": localize_input,
}

r = requests.post(f"{BASE}/predict/pipeline", json=pipeline_input)
print_result("FULL PIPELINE", r)

# ── 8. Results History ─────────────────────────────────────────
r = requests.get(f"{BASE}/results/summary")
print_result("RESULTS SUMMARY", r)

r = requests.get(f"{BASE}/results/?limit=3")
print_result("RECENT RESULTS (last 3)", r)
"""
Model Registry — loads all 5 ML models into memory once at startup.
All modules import from here instead of loading models per-request.
"""

import os
import pickle
import joblib
import numpy as np
import pandas as pd
from typing import Any, Dict, Optional
from sklearn.base import BaseEstimator, TransformerMixin
from joblib.numpy_pickle import NumpyUnpickler

# ── Paths ──────────────────────────────────────────────────────────────────────
BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
MODELS_DIR = os.path.join(BASE_DIR, "models_store")

MODEL_PATHS = {
    # Core models (required)
    "fault_prediction":        os.path.join(MODELS_DIR, "fault_risk_model.pkl"),
    "fault_classification":    os.path.join(MODELS_DIR, "fault_classification_model.pkl"),
    "substation_localization": os.path.join(MODELS_DIR, "substation_classification_model.pkl"),
    "distance_localization":   os.path.join(MODELS_DIR, "distance_regression_model.pkl"),
    "latent_alert":            os.path.join(MODELS_DIR, "lgb_model_v3.pkl"),
    "etr_prediction":          os.path.join(MODELS_DIR, "etr_model.pkl"),
}

# Models that won't crash startup if their .pkl file is not uploaded yet
OPTIONAL_MODELS = {"distance_localization", "etr_prediction"}

# encoders/scalers used by the models (must be kept in sync with how models were trained)
ENCODER_PATHS = {
    "fault_classification_le": os.path.join(MODELS_DIR, "substation_label_encoder_fault.pkl"),
    "substation_scaler":       os.path.join(MODELS_DIR, "substation_scaler_classification.pkl"),
    "substation_le":           os.path.join(MODELS_DIR, "substation_label_encoder_substation.pkl"),
    "fault_zone_le":           os.path.join(MODELS_DIR, "substation_label_encoder_fault.pkl"),
    "distance_scaler":         os.path.join(MODELS_DIR, "distance_scaler_regression.pkl"),
    "etr_encoders":            os.path.join(MODELS_DIR, "etr_encoders.pkl"),
    "etr_scaler":              os.path.join(MODELS_DIR, "str_scaler.pkl"),
}

# Fault type labels for classification (6 classes: 0-5)
FAULT_TYPE_LABELS = {
    0: "LG",
    1: "LL",
    2: "LLG",
    3: "LLL",
    4: "LLLG",
    5: "No Fault",
}

# Substation labels — alphabetically sorted (matches sklearn LabelEncoder default)
SUBSTATION_LABELS = {
    0:  "Bahadurabad Substation",
    1:  "Buffer Zone Substation",
    2:  "Clifton Block 8 Substation",
    3:  "Clifton Substation",
    4:  "Defence Substation",
    5:  "F.B Industrial Substation",
    6:  "Garden Substation",
    7:  "Gulberg Substation",
    8:  "Gulshan-e-Iqbal Substation",
    9:  "Gulshan-e-Maymar Substation",
    10: "Karachi Port Substation",
    11: "Korangi Creek Substation",
    12: "Korangi Industrial Substation",
    13: "Korangi No. 2 Substation",
    14: "Korangi Substation",
    15: "Landhi Substation",
    16: "Liaquatabad Substation",
    17: "Malir Cantonment Substation",
    18: "Malir Substation",
    19: "Mehmoodabad Substation",
    20: "North Karachi Substation",
    21: "North Nazimabad Substation",
    22: "Numaish Substation",
    23: "Orangi Substation",
    24: "PECHS Substation",
    25: "SITE Substation",
    26: "Saddar Substation",
    27: "Shah Faisal Substation",
    28: "Soldier Bazaar Substation",
    29: "Tariq Road Substation",
}

# ── Custom FeatureEngineer (required to unpickle fault_classification_model) ───
class FeatureEngineer(BaseEstimator, TransformerMixin):
    """
    Exact feature set confirmed from model's feature_names_in_:
    ['Ia','Ib','Ic','Va','Vb','Vc',
     'I_total','I_max','I_min','I_range',
     'V_total','V_std',
     'Ia_Va_ratio','Ib_Vb_ratio','Ic_Vc_ratio']
    """
    def fit(self, X, y=None):
        return self

    def transform(self, X):
        if not isinstance(X, pd.DataFrame):
            X = pd.DataFrame(X, columns=["Ia", "Ib", "Ic", "Va", "Vb", "Vc"])
        X = X.copy()
        Ia, Ib, Ic = X["Ia"], X["Ib"], X["Ic"]
        Va, Vb, Vc = X["Va"], X["Vb"], X["Vc"]
        abs_a, abs_b, abs_c = Ia.abs(), Ib.abs(), Ic.abs()
        X["I_total"]     = Ia + Ib + Ic
        X["I_max"]       = np.maximum.reduce([abs_a, abs_b, abs_c])
        X["I_min"]       = np.minimum.reduce([abs_a, abs_b, abs_c])
        X["I_range"]     = X["I_max"] - X["I_min"]
        X["V_total"]     = Va + Vb + Vc
        X["V_std"]       = np.std([Va, Vb, Vc], axis=0)
        X["Ia_Va_ratio"] = Ia / (Va.abs() + 1e-6)
        X["Ib_Vb_ratio"] = Ib / (Vb.abs() + 1e-6)
        X["Ic_Vc_ratio"] = Ic / (Vc.abs() + 1e-6)
        return X


# ── ETR lookup table (rule-based with new short-code labels) ─────────
ETR_LOOKUP = {
    "No Fault":  {"min_hours": 0,   "max_hours": 0,   "typical_hours": 0},
    "LG":        {"min_hours": 0.5, "max_hours": 4,   "typical_hours": 1.5},  # Line-to-Ground
    "LL":        {"min_hours": 1,   "max_hours": 6,   "typical_hours": 2.5},  # Line-to-Line
    "LLG":       {"min_hours": 2,   "max_hours": 8,   "typical_hours": 4},    # Double Line-to-Ground
    "LLL":       {"min_hours": 3,   "max_hours": 12,  "typical_hours": 6},    # Three-Phase
    "LLLG":      {"min_hours": 4,   "max_hours": 24,  "typical_hours": 8},    # Three-Phase-to-Ground
}


# ── Model Registry ──────────────────────────────────────────────────────────────
class ModelRegistry:
    def __init__(self):
        self._models: Dict[str, Any] = {}
        self._status: Dict[str, str] = {k: "not_loaded" for k in MODEL_PATHS}
        self._loaded_count = 0

    def _load_fault_classification(self, path: str) -> Any:
        """Uses NumpyUnpickler with patched FeatureEngineer class."""
        import sys
        sys.modules["__main__"].FeatureEngineer = FeatureEngineer
        with open(path, "rb") as f:
            # mmap_mode must be None or a valid mode string ('r', 'c', ...), not bool.
            unpickler = NumpyUnpickler(path, f, None)
            return unpickler.load()

    @staticmethod
    def _is_numpy_bitgen_compat_error(err: Exception) -> bool:
        msg = str(err)
        return ("known BitGenerator module" in msg) or ("MT19937" in msg)

    def load_all(self):
        """Load all models. Called once at startup."""
        import warnings
        warnings.filterwarnings("ignore", category=UserWarning)

        loaders = {
            "fault_prediction":        lambda p: pickle.load(open(p, "rb")),
            "fault_classification":    self._load_fault_classification,
            "substation_localization": joblib.load,
            "latent_alert":            joblib.load,
            "distance_localization":   joblib.load,
            "etr_prediction":          joblib.load,
        }

        for name, path in MODEL_PATHS.items():
            optional = name in OPTIONAL_MODELS
            try:
                if optional and not os.path.exists(path):
                    self._status[name] = "not_uploaded"
                    print(f"  [WARN] {name}: not uploaded (optional - fallback active)")
                    continue
                self._models[name] = loaders[name](path)
                self._status[name] = "loaded"
                self._loaded_count += 1
                print(f"  [OK] {name}: loaded ({type(self._models[name]).__name__})")
            except Exception as e:
                if optional:
                    if self._is_numpy_bitgen_compat_error(e):
                        self._status[name] = "incompatible_pickle"
                        print(
                            f"  [WARN] {name}: incompatible pickle for current numpy/joblib "
                            f"(optional - fallback active): {e}"
                        )
                    else:
                        self._status[name] = f"error: {str(e)}"
                        print(f"  [WARN] {name}: load failed (optional - fallback active): {e}")
                else:
                    self._status[name] = f"error: {str(e)}"
                    print(f"  [ERROR] {name}: {e}")

        # Load encoders and scalers
        for name, path in ENCODER_PATHS.items():
            try:
                self._models[name] = joblib.load(path)
                self._status[name] = "loaded"
                print(f"  ✅ {name}: loaded ({type(self._models[name]).__name__})")
            except Exception as e:
                self._status[name] = f"error: {str(e)}"
                print(f"  ❌ {name}: {e}")

    def reload(self, model_name: Optional[str] = None):
        """Reload one or all models."""
        if model_name:
            names = [model_name]
        else:
            names = list(MODEL_PATHS.keys())
            self._loaded_count = 0

        import warnings
        warnings.filterwarnings("ignore", category=UserWarning)

        loaders = {
            "fault_prediction":        lambda p: pickle.load(open(p, "rb")),
            "fault_classification":    self._load_fault_classification,
            "substation_localization": joblib.load,
            "latent_alert":            joblib.load,
            "distance_localization":   joblib.load,
            "etr_prediction":          joblib.load,
        }

        for name in names:
            if name not in MODEL_PATHS:
                raise ValueError(f"Unknown model: {name}")
            optional = name in OPTIONAL_MODELS
            path = MODEL_PATHS[name]
            try:
                if optional and not os.path.exists(path):
                    self._status[name] = "not_uploaded"
                    continue
                self._models[name] = loaders[name](path)
                self._status[name] = "loaded"
                self._loaded_count += 1
            except Exception as e:
                if optional:
                    if self._is_numpy_bitgen_compat_error(e):
                        self._status[name] = "incompatible_pickle"
                    else:
                        self._status[name] = f"error: {str(e)}"
                    continue
                self._status[name] = f"error: {str(e)}"
                raise RuntimeError(f"Failed to load {name}: {e}")

        # Load encoders and scalers
        for name, path in ENCODER_PATHS.items():
            try:
                self._models[name] = joblib.load(path)
                self._status[name] = "loaded"
                print(f"  ✅ {name}: loaded ({type(self._models[name]).__name__})")
            except Exception as e:
                self._status[name] = f"error: {str(e)}"
                print(f"  ❌ {name}: {e}")

    def get(self, name: str) -> Any:
        if name not in self._models:
            raise RuntimeError(f"Model '{name}' is not loaded. Call /models/load first.")
        return self._models[name]

    @property
    def status(self) -> Dict[str, str]:
        return self._status.copy()

    @property
    def loaded_count(self) -> int:
        return self._loaded_count

    @property
    def total_count(self) -> int:
        return len(MODEL_PATHS)


# ── Singleton ──────────────────────────────────────────────────────────────────
model_registry = ModelRegistry()
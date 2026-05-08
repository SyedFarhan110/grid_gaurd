"""
FYDP - Power Fault Detection & Management System
FastAPI Backend Entry Point
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from app.routers import models, predict, results, health, stream
from app.core.model_registry import model_registry
from app.core.stream_manager import stream_manager


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Load all models at startup."""
    import warnings
    warnings.filterwarnings("ignore")
    print("🔄 Loading all ML models at startup...")
    model_registry.load_all()
    print("✅ All models loaded successfully!")
    yield
    print("🛑 Shutting down server...")


app = FastAPI(
    title="FYDP Power Fault Management System API",
    description="""
## Power Distribution Fault Prediction & Management System

Built for Karachi's power distribution network. This API runs a chained ML pipeline:

1. **Fault Prediction** – Predicts if a fault will occur in the next hour (XGBoost)
2. **Fault Classification** – Classifies the fault type (Decision Tree Pipeline)
3. **Fault Localization** – Predicts substation zone of the fault (Random Forest)
4. **ETR Prediction** – Estimates recovery time based on fault type
5. **Latent Alert Detection** – Detects feeder load anomalies/spikes (LightGBM)

### Pipeline Flow
`Fault Prediction → [if fault] → Fault Classification → Fault Localization → ETR Prediction`

`Latent Alert Detection` runs independently on feeder data.
    """,
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],       # allow all origins (no credentials = wildcard is safe)
    allow_credentials=False,   # must be False when allow_origins=["*"]
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["ngrok-skip-browser-warning"],
)

app.include_router(health.router,   prefix="/health",  tags=["Health"])
app.include_router(models.router,   prefix="/models",  tags=["Models"])
app.include_router(predict.router,  prefix="/predict", tags=["Predictions"])
app.include_router(results.router,  prefix="/results", tags=["Results"])
app.include_router(stream.router,   prefix="/stream",  tags=["Stream"])


@app.get("/", tags=["Root"])
def root():
    return {
        "system": "FYDP Power Fault Management System",
        "version": "1.0.0",
        "status": "running",
        "docs": "/docs",
        "endpoints": {
            "health":  "/health",
            "models":  "/models",
            "predict": "/predict",
            "results": "/results",
            "stream":  "/stream/events",
        },
    }
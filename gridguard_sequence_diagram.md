# GridGuard — Full System Sequence Diagram

> Covers every module end-to-end: backend startup, ML pipeline, SSE streaming, Firestore, and all frontend UI modules.

---

## 1. System Startup & Initialization

```mermaid
sequenceDiagram
    autonumber
    participant DEV as Developer / Server
    participant MAIN as main.py (FastAPI Lifespan)
    participant MR as ModelRegistry
    participant FS_PKL as models_store/*.pkl
    participant SM as StreamManager
    participant DB as FirestoreDB (db.py)
    participant GCP as Google Cloud Firestore

    DEV->>MAIN: uvicorn app.main:app
    activate MAIN
    MAIN->>DB: FirestoreDB.__init__()
    DB-->>GCP: credentials.Certificate(serviceAccountKey.json)
    GCP-->>DB: Auth OK → firestore.Client(project, database='default')
    DB-->>MAIN: db_client.enabled = True

    MAIN->>MR: model_registry.load_all()
    activate MR
    MR->>FS_PKL: pickle.load(fault_risk_model.pkl)
    FS_PKL-->>MR: XGBoost model ✓
    MR->>FS_PKL: NumpyUnpickler(fault_classification_model.pkl)
    FS_PKL-->>MR: Decision Tree Pipeline + FeatureEngineer ✓
    MR->>FS_PKL: joblib.load(substation_classification_model.pkl)
    FS_PKL-->>MR: Random Forest (substation) ✓
    MR->>FS_PKL: joblib.load(distance_regression_model.pkl)
    FS_PKL-->>MR: Distance Regression ✓
    MR->>FS_PKL: joblib.load(lgb_model_v3.pkl)
    FS_PKL-->>MR: LightGBM (latent alert) ✓
    MR->>FS_PKL: joblib.load(etr_model.pkl)
    FS_PKL-->>MR: ETR Model ✓
    MR->>FS_PKL: joblib.load(encoders + scalers)
    FS_PKL-->>MR: LabelEncoders + StandardScalers ✓
    deactivate MR

    MAIN->>SM: stream_manager.start_stream()
    SM->>SM: asyncio.create_task(_producer())
    SM-->>MAIN: Background producer task running
    MAIN-->>DEV: FastAPI server ready on :8000
    deactivate MAIN
```

---

## 2. Autonomous ML Producer Loop (Background Task)

```mermaid
sequenceDiagram
    autonumber
    participant SM as StreamManager._producer()
    participant CSV as data/unified_pipeline_stream.csv
    participant FE as feature_engineering.py
    participant MR as ModelRegistry
    participant PL as predict.run_full_pipeline()
    participant RS as ResultStore
    participant DB as FirestoreDB
    participant GCP as Google Cloud Firestore
    participant SQ as asyncio.Queue[]

    SM->>CSV: pd.read_csv(unified_pipeline_stream.csv)
    CSV-->>SM: DataFrame (cycling iterator)

    loop Every 1.0 second (per row)
        SM->>SM: _load_history.append(feeder_load)
        SM->>SM: _build_payload(row, load_history)
        Note over SM: Constructs FullPipelineInput dict with<br/>fault_prediction, latent_alert,<br/>fault_classification, localization fields

        SM->>PL: asyncio.to_thread(run_full_pipeline, payload, raw_data=row)
        activate PL

        %% Step 1: Fault Prediction
        PL->>FE: prepare_fault_prediction_features(data)
        FE-->>PL: DataFrame [31 features]
        PL->>MR: model_registry.get("fault_prediction")
        MR-->>PL: XGBoost model
        PL->>PL: model.predict_proba(X) → fault_prob
        PL->>PL: _get_risk_level(prob) → LOW/MEDIUM/HIGH/CRITICAL

        %% Step 2: Latent Alert (independent)
        PL->>FE: prepare_latent_alert_features(data)
        FE-->>PL: DataFrame [54 features incl. lag/rolling/cyclical]
        PL->>MR: model_registry.get("latent_alert")
        MR-->>PL: LightGBM model
        PL->>PL: model.predict_proba(X) → anomaly_prob
        PL->>PL: Classify → NORMAL / SPIKE / ANOMALY

        alt fault_predicted == True
            %% Step 3: Fault Classification
            PL->>FE: prepare_fault_classification_features(data)
            FE-->>PL: DataFrame [Ia,Ib,Ic,Va,Vb,Vc]
            PL->>MR: model_registry.get("fault_classification")
            MR-->>PL: Decision Tree Pipeline (w/ FeatureEngineer)
            PL->>PL: Pipeline internally derives I_total,I_max,I_min,<br/>I_range,V_total,V_std,ratios → predict()
            PL->>PL: FAULT_TYPE_LABELS[pred] → LG/LL/LLG/LLL/LLLG/No Fault

            %% Step 4: Fault Localization
            PL->>FE: prepare_localization_features(data)
            FE-->>PL: DataFrame [V1..V3,I1..I3 + V_ratio,I_ratio,V_drop,Z_apparent,I_avg]
            PL->>MR: get("substation_localization"), get("distance_localization")
            MR-->>PL: Random Forest + Distance Regression
            PL->>MR: get("substation_scaler"), get("distance_scaler"), get("substation_le")
            MR-->>PL: Scalers + LabelEncoder
            PL->>PL: sub_scaler.transform(X) → RF.predict() → le.inverse_transform()
            PL->>PL: dist_scaler.transform(X) → DistReg.predict() → distance_km

            %% Step 5: ETR
            PL->>PL: _location_factor(localization) → area×distance factor
            PL->>PL: FAULT_TYPE_TO_CAUSE[label] → cause string
            PL->>MR: get("etr_prediction"), get("etr_encoders"), get("etr_scaler")
            MR-->>PL: ETR Model + Encoders + Scaler
            PL->>PL: encode(area,cause,grid,climate) + scale(numerics)
            PL->>PL: etr_model.predict() → expm1(log_pred_minutes)/60 → hours
            PL->>PL: Apply loc_factor + FAULT_ETR_CAPS[label]
        else fault_predicted == False
            PL->>PL: classification=None, localization=None, etr=None
        end

        %% Persist Result
        PL->>RS: result_store.save(result)
        RS->>RS: uuid4() + datetime.now() → record
        RS->>RS: _cache.append(record)
        alt is_fault OR is_anomaly AND Firestore quota OK
            RS->>DB: db.collection("pipeline_results").document(id).set(record, timeout=2s)
            DB->>GCP: Firestore write
            GCP-->>DB: OK
        else quota error (429 / ResourceExhausted)
            RS->>RS: _last_quota_error_time = now()<br/>Disable Firestore for 300s
        end
        RS-->>PL: record_id

        PL->>PL: result["id"] = record_id
        deactivate PL

        %% Broadcast
        PL->>SM: stream_manager.broadcast(result, raw_data=row)
        SM->>SM: json.dumps({event_id, timestamp, raw_data, pipeline_result, prediction})
        SM->>SM: loop.call_soon_threadsafe(_put_in_all_queues)
        SM->>SQ: q.put_nowait(message) [for each connected client queue]
    end
```

---

## 3. Frontend Initialization & SSE Connection

```mermaid
sequenceDiagram
    autonumber
    participant USER as Browser (Operator)
    participant NX as Next.js Page (page.tsx)
    participant AP as AppProvider (store.tsx)
    participant STR as StreamManager (streaming.ts)
    participant API as api.ts (REST Client)
    participant BE as FastAPI Backend
    participant FS as Firestore

    USER->>NX: Navigate to dashboard URL
    NX->>AP: AppProvider mounts → useReducer(reducer, initialState)
    AP->>AP: initLiveReadings() → 30 synthetic readings in state

    %% SSE Connection
    AP->>STR: streamManager.connect()
    STR->>BE: fetch(GET /stream/events, headers: Accept=text/event-stream)
    BE->>BE: stream_manager.add_client() → new asyncio.Queue()
    BE-->>STR: HTTP 200 + StreamingResponse (text/event-stream)
    STR->>STR: isConnected=true, resetHeartbeatTimeout(45s)
    STR-->>AP: Promise resolved
    AP->>AP: dispatch(SET_STREAM_CONNECTED, true)

    %% Subscribe to events
    AP->>STR: streamManager.subscribe(callback)
    STR->>STR: callbacks.add(callback)
    AP->>STR: streamManager.onError(errorCallback)

    %% Initial REST data fetch
    AP->>API: api.modelStatus() → GET /models/status
    API->>BE: HTTP GET /models/status
    BE-->>API: {loaded, total, all_ready, models[]}
    API-->>AP: ModelStatus
    AP->>AP: dispatch(SET_MODEL_STATUS)

    AP->>API: api.summary() → GET /results/summary
    API->>BE: HTTP GET /results/summary
    BE->>BE: result_store.get_summary()
    BE-->>API: {total_predictions, faults, alerts, rates}
    API-->>AP: ResultsSummary
    AP->>AP: dispatch(SET_SUMMARY)

    AP->>API: api.results(100, fault_only=true) → GET /results/?limit=100&fault_only=true
    API->>BE: HTTP GET /results/
    BE->>BE: result_store.get_all(limit=100, fault_only=true)
    BE->>FS: query pipeline_results ORDER BY timestamp DESC LIMIT 100
    FS-->>BE: Firestore docs (merges with memory cache)
    BE-->>API: {count, results[]}
    API-->>AP: PipelineResult[]
    AP->>AP: dispatch(SET_HISTORY, results)

    NX->>NX: ModuleRenderer renders Dashboard (default module)
    NX-->>USER: Dashboard UI rendered
```

---

## 4. Real-Time SSE Event Flow → Frontend State Update

```mermaid
sequenceDiagram
    autonumber
    participant SM as StreamManager (Backend)
    participant SQ as asyncio.Queue
    participant SR as stream.py /stream/events
    participant STR as StreamManager (Frontend)
    participant AP as AppProvider Reducer
    participant DASH as Dashboard.tsx
    participant FP as FaultPrediction.tsx
    participant CLS as Classification.tsx
    participant LOC as Localization.tsx
    participant ETR as ETR.tsx
    participant ANO as AnomalyInsights.tsx
    participant MAP as KarachiMap.tsx

    loop Every ~1 second
        SM->>SQ: q.put_nowait(json_message)
        SR->>SQ: await asyncio.wait_for(queue.get(), timeout=5s)
        SQ-->>SR: message string

        alt message received
            SR-->>STR: yield "event: stream_event\ndata: {json}\n\n"
            STR->>STR: reader.read() → decode → split on \n\n
            STR->>STR: parse event type + data JSON
            STR->>STR: eventData = {event_id, timestamp, raw_data, pipeline_result}
            STR->>STR: resetHeartbeatTimeout()
            STR->>STR: notifyCallbacks(eventData)
            STR->>AP: callback(StreamEvent)

            AP->>AP: dispatch(STREAM_EVENT, event)
            AP->>AP: reducer: extract result = event.pipeline_result
            AP->>AP: ADD liveReading from raw_data<br/>(Avg_Voltage, Avg_Current, Average_PF, KW_Plus)
            AP->>AP: latestResult = result
            AP->>AP: faultState = fault_predicted ? 'alert' : 'normal'
            AP->>AP: faultModulesUnlocked |= fault_predicted

            alt fault_predicted == true
                AP->>AP: stickyFaultResult = result
                AP->>AP: pushFaultToStacks(result) → faultStacks[all modules][0..9]
            end
            AP->>AP: lastPollTime = timestamp
            AP->>AP: streamError = null

        else timeout (5 seconds)
            SR-->>STR: yield "event: heartbeat\ndata: {}\n\n"
            STR->>STR: eventType === 'heartbeat' → resetHeartbeatTimeout(), skip
        end
    end

    Note over DASH,MAP: All components re-render via useApp() context
    AP-->>DASH: state.liveReadings, faultState, latestResult
    DASH->>DASH: Update StatusBanner (NORMAL/HIGH RISK)
    DASH->>DASH: Update StatCards (voltage, current, PF, load)
    DASH->>DASH: Update AreaChart + LineChart (last 20 readings)
    DASH->>DASH: Compute active alerts array
    DASH->>MAP: faultZone = localization.substation_name
    MAP->>MAP: Highlight substation marker on Leaflet map

    AP-->>FP: state.latestResult.pipeline
    FP->>FP: Show fault_probability, risk_level, confidence gauge

    AP-->>CLS: state.stickyFaultResult.classification
    CLS->>CLS: Show fault_type_label, all_probabilities bar chart

    AP-->>LOC: state.stickyFaultResult.localization
    LOC->>LOC: Show substation_name, zone, distance_km

    AP-->>ETR: state.stickyFaultResult.etr
    ETR->>ETR: Show estimated_recovery, min/max range, source

    AP-->>ANO: state.latestResult.latent_alert
    ANO->>ANO: Show anomaly_detected, alert_type, notes, probability trend
```

---

## 5. History Module — Polling, Lazy Loading & Status Update

```mermaid
sequenceDiagram
    autonumber
    participant USER as Operator (Browser)
    participant HM as HistoryModule.tsx
    participant AP as AppProvider (store.tsx)
    participant API as api.ts
    participant BE as FastAPI /results
    participant RS as ResultStore
    participant FS as Firestore

    %% Auto-refresh every 60s
    loop Every 60 seconds
        AP->>API: api.results(100, fault_only=true)
        API->>BE: GET /results/?limit=100&fault_only=true
        BE->>RS: result_store.get_all(limit=100, fault_only=true)
        RS->>RS: Read in-memory _cache (deque maxlen=1000)
        alt cache < 100 AND Firestore quota OK
            RS->>FS: query pipeline_results DESC LIMIT 100
            FS-->>RS: docs → merge with cache, sort by timestamp
        end
        RS-->>BE: filtered results[]
        BE-->>API: {count, results[]}
        API-->>AP: PipelineResult[]
        AP->>AP: dispatch(SET_HISTORY, results)
        AP-->>HM: state.history updated
    end

    %% Operator views history
    USER->>HM: Navigate to History module
    HM->>HM: Render Fault Stack from state.faultStacks['anomaly']
    HM->>HM: Render search table from state.history
    HM->>HM: Compute uniqueLocations, uniqueFaultTypes from faultStacks

    %% Filter interaction
    USER->>HM: Click location/faultType filter pill
    HM->>HM: setLocationFilter / setFaultTypeFilter
    HM->>HM: useMemo: filteredFaults recomputed

    %% Expand archived fault (lazy load from Firestore)
    USER->>HM: Click archived fault row (index >= 5)
    HM->>API: api.getResult(fault.id) → GET /results/{id}
    API->>BE: HTTP GET /results/{id}
    BE->>RS: result_store.get_by_id(id)
    RS->>RS: Search _cache first
    alt not in cache
        RS->>FS: db.collection("pipeline_results").document(id).get()
        FS-->>RS: Full document
    end
    RS-->>BE: record dict
    BE-->>API: PipelineResult
    API-->>HM: fullData
    HM->>HM: setDetailedData({id: fullData})
    HM->>HM: Render expanded detail panel<br/>(Prediction, Location, Classification, Recovery, Latent Alert, Pipeline Stages)

    %% Status update
    USER->>HM: Change status dropdown → "resolved" or "false_positive"
    HM->>API: api.updateResultStatus(id, newStatus) → PATCH /results/{id}/status
    API->>BE: HTTP PATCH /results/{id}/status?status=resolved
    BE->>RS: result_store.update_status(id, "resolved")
    RS->>RS: Update _cache record.status
    RS->>FS: db.collection(...).document(id).update({status}, timeout=2s)
    FS-->>RS: OK
    RS-->>BE: True
    BE-->>API: {message, id, status}
    API-->>HM: success
    HM->>HM: setDetailedData updated
    HM->>HM: setHiddenIds.add(id) → row removed from stack
```

---

## 6. SSE Reconnection & Error Recovery

```mermaid
sequenceDiagram
    autonumber
    participant STR as StreamManager (Frontend)
    participant AP as AppProvider
    participant BE as FastAPI /stream/events
    participant SR as stream.py

    Note over STR: Heartbeat timeout = 45 seconds

    alt Connection lost / server restart
        STR->>STR: reader.read() returns done=true OR throws
        STR->>STR: handleConnectionLoss()
        STR->>STR: isConnected = false, clearHeartbeatTimeout()

        loop Up to 5 retry attempts (exponential backoff)
            STR->>STR: delay = 2000ms × 2^attempt
            STR->>STR: setTimeout → connect()
            STR->>BE: fetch(GET /stream/events)
            alt reconnect success
                BE->>SR: stream_manager.add_client() → new Queue
                BE-->>STR: HTTP 200
                STR->>STR: isConnected=true, reconnectAttempts=0
                STR->>AP: notifyCallbacks (resumes events)
                AP->>AP: dispatch(SET_STREAM_CONNECTED, true)
            else still failing
                STR->>STR: reconnectAttempts++
            end
        end

        alt max attempts exceeded
            STR->>AP: notifyErrors(Error("Max reconnection attempts reached"))
            AP->>AP: dispatch(SET_STREAM_ERROR, error.message)
            AP->>AP: dispatch(SET_STREAM_CONNECTED, false)
            AP->>AP: setTimeout 5s → streamManager.connect() retry
        end
    end

    alt Client navigates away / component unmount
        AP->>STR: unsubscribeRef.current() → callbacks.delete(cb)
        AP->>STR: streamManager.disconnect()
        STR->>STR: reader.cancel()
        STR->>STR: isConnected = false
        SR->>SR: finally: stream_manager.remove_client(queue)
        Note over SR: Stream continues running autonomously<br/>for remaining/future clients
    end
```

---

## 7. Health Check & Model Management API

```mermaid
sequenceDiagram
    autonumber
    participant OPS as DevOps / Monitoring
    participant BE as FastAPI Backend
    participant HR as health.py
    participant MR as ModelRegistry
    participant MO as models.py

    OPS->>BE: GET /health
    BE->>HR: health_check()
    HR->>MR: model_registry.loaded_count, total_count, status
    MR-->>HR: counts + status dict
    HR-->>BE: {status:"healthy", timestamp, python, platform,<br/>models_loaded, models_total, all_ready}
    BE-->>OPS: HTTP 200

    OPS->>BE: GET /health/models
    BE->>HR: model_health()
    HR->>MR: model_registry.status (all model names → "loaded"/"error")
    MR-->>HR: status dict
    HR-->>BE: {all_models_ready, models:{name:{ok,status}}}
    BE-->>OPS: HTTP 200

    OPS->>BE: GET /models/status
    BE->>MO: list_models()
    MO->>MR: model_registry.status
    MR-->>MO: status dict
    MO-->>BE: ModelStatusResponse[]
    BE-->>OPS: HTTP 200

    OPS->>BE: POST /models/load
    BE->>MO: load_models()
    MO->>MR: model_registry.reload()
    MR->>MR: Re-load all .pkl files from disk
    MR-->>MO: updated counts
    MO-->>BE: {message, loaded, total}
    BE-->>OPS: HTTP 200
```

---

## 8. Complete Data & Component Architecture Summary

```mermaid
sequenceDiagram
    autonumber
    participant CSV as CSV Data Source
    participant BE as FastAPI Backend
    participant ML as ML Pipeline (5 Models)
    participant MEM as In-Memory Cache
    participant FS as Google Cloud Firestore
    participant SSE as SSE /stream/events
    participant FE as Next.js Frontend
    participant UI as Dashboard + 7 Modules

    Note over CSV,BE: AUTONOMOUS PRODUCTION PATH
    CSV->>BE: Row data (cycling, 1s interval)
    BE->>ML: run_full_pipeline(FullPipelineInput)
    ML-->>BE: PipelineResult {pipeline, classification,<br/>localization, etr, latent_alert}
    BE->>MEM: result_store._cache.append(record)
    BE->>FS: Conditional write (fault OR anomaly only,<br/>quota-aware, 2s timeout)
    BE->>SSE: stream_manager.broadcast(result)

    Note over SSE,FE: REAL-TIME DELIVERY
    SSE->>FE: SSE event: stream_event + heartbeat (5s fallback)
    FE->>FE: StreamManager.notifyCallbacks(event)
    FE->>FE: AppProvider.dispatch(STREAM_EVENT)
    FE->>FE: Reducer updates: latestResult, stickyFaultResult,<br/>faultState, faultStacks, liveReadings, lastPollTime

    Note over FE,UI: UI RENDERING
    FE->>UI: React context propagation (useApp hook)
    UI->>UI: Dashboard: StatusBanner + StatCards + Charts + Map + Alerts
    UI->>UI: FaultPrediction: Risk gauge + probability display
    UI->>UI: Classification: Fault type + probability bars (LG/LL/LLG/LLL/LLLG)
    UI->>UI: Localization: Substation + zone + distance on map
    UI->>UI: ETR: Recovery time estimate + min/max range
    UI->>UI: AnomalyInsights: Feeder anomaly + alert type
    UI->>UI: WeatherAnalysis: temp/humidity/wind conditions
    UI->>UI: HistoryModule: FaultStack + search table + status badges

    Note over FE,FS: HISTORICAL DATA PATH (REST)
    FE->>BE: GET /results/ (every 60s + on-demand)
    BE->>MEM: get_all() → merge cache + Firestore
    BE->>FS: Query pipeline_results DESC LIMIT 100
    FS-->>BE: Historical fault records
    BE-->>FE: PipelineResult[]
    FE->>FE: dispatch(SET_HISTORY)
```

---

## Actors & Components Legend

| Actor | Description |
|---|---|
| **FastAPI main.py** | Entry point — lifespan manages startup/shutdown |
| **ModelRegistry** | Singleton — loads & serves 6 ML models + encoders |
| **StreamManager (BE)** | Autonomous producer — reads CSV, runs pipeline, broadcasts |
| **feature_engineering.py** | Transforms raw dict → model-ready DataFrames |
| **predict.run_full_pipeline()** | Orchestrates 5-stage chained ML pipeline |
| **ResultStore** | Dual-layer store: in-memory deque (1000 max) + Firestore |
| **FirestoreDB** | Firebase Admin SDK client — quota-aware writes (2s timeout) |
| **stream.py /stream/events** | SSE endpoint — one queue per client, 5s heartbeat |
| **StreamManager (FE)** | Fetch-based SSE reader, 45s heartbeat, exponential backoff |
| **AppProvider / store.tsx** | React Context + useReducer — single source of truth |
| **api.ts** | All REST calls — pipeline, results, models, health |
| **Dashboard.tsx** | Live charts (Recharts), Leaflet map, active alerts |
| **7 UI Modules** | FaultPrediction, Classification, Localization, ETR, AnomalyInsights, WeatherAnalysis, HistoryModule |

| ML Model | Algorithm | Purpose |
|---|---|---|
| `fault_risk_model.pkl` | XGBoost | Predict fault probability (31 features) |
| `fault_classification_model.pkl` | Decision Tree Pipeline + FeatureEngineer | Classify fault type: LG/LL/LLG/LLL/LLLG |
| `substation_classification_model.pkl` | Random Forest | Identify fault substation (30 substations) |
| `distance_regression_model.pkl` | Regression | Estimate distance to fault (km) |
| `lgb_model_v3.pkl` | LightGBM | Detect feeder load anomalies (54 features) |
| `etr_model.pkl` | Regression (log1p target) | Estimate time to recovery (hours) |

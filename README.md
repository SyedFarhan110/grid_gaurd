# GridGuard: Power Fault Prediction & Management System

GridGuard is an end-to-end AI-driven solution designed for real-time monitoring, prediction, and management of electrical distribution faults. Developed specifically for complex power distribution networks (like Karachi's), the system leverages a chained machine learning pipeline to identify, classify, and localize faults before they escalate into major outages.

---

## 🚀 Key Features

### 1. Intelligent ML Pipeline
- **Proactive Fault Prediction:** Uses an **XGBoost** model to analyze historical and real-time telemetry, predicting potential faults with a high confidence interval.
- **Fault Type Classification:** A **Decision Tree** pipeline that distinguishes between various fault types (Line-to-Ground, Line-to-Line, etc.) to help technicians prepare the right equipment.
- **Precise Localization:** A hybrid **Random Forest** and **Multi-Output Regression** model that identifies the specific substation zone and calculates the distance to the fault in kilometers.
- **Latent Anomaly Detection:** An independent **LightGBM** engine that identifies "silent" load spikes and feeder stress patterns that don't yet trigger physical protection but indicate future failures.

### 2. Autonomous Real-Time Engine
- **SSE Streaming:** Leverages Server-Sent Events (SSE) to push live data from the backend to all connected clients (Web & Mobile) with sub-second latency.
- **Background Prediction Loop:** The backend runs a continuous `stream_manager` that processes telemetry data autonomously, ensuring the system stays active even when no operators are logged in.

### 3. Cloud-Native Persistence
- **Intelligent Logging:** To optimize storage, the system only persists data to **Firebase Firestore** when the ML pipeline validates a significant event (Fault or Anomaly).
- **Hybrid Data Access:** Combines fast in-memory React state for live dashboard updates with persistent Firestore storage for historical auditing and long-term trend analysis.

---

## 🛠 Tech Stack

| Layer | Technology | Role |
| :--- | :--- | :--- |
| **Backend** | FastAPI (Python 3.10+) | High-performance asynchronous API & Pipeline orchestration |
| **ML Engine** | Scikit-learn, XGBoost, LightGBM | Multi-stage predictive modeling & feature engineering |
| **Database** | Firebase Firestore | Cloud persistence for detected incidents & alerts |
| **Web UI** | Next.js 15 (React 19) | Real-time monitoring dashboard with modular architecture |
| **Mobile** | Flutter | Cross-platform native application (Android/iOS) |
| **Real-time** | SSE / WebSockets | Direct server-to-client data broadcasting |
| **Deployment** | Vercel & Ngrok | Frontend hosting and secure backend tunneling |

---

## 📂 Project Structure

### `Backend/`
- **`app/core/`**: Contains the `stream_manager` for background tasks, `model_registry` for loading ML models, and `feature_engineering` logic.
- **`app/routers/`**: Modular API endpoints for predictions, results, and health checks.
- **`models_store/`**: Serialized `.joblib` files for all trained models.
- **`data/`**: CSV-based unified telemetry streams for real-world simulation.

### `gridguard_ui/` (Frontend)
- **`components/modules/`**: Individual reactive modules for Fault Prediction, ETR, Localization, and History.
- **`lib/store.tsx`**: Centralized state management handling SSE events and global application state.
- **`lib/api.ts`**: Typed service layer for all backend communications.

### `grid_guard/` (Mobile)
- **`lib/main.dart`**: Flutter entry point featuring a custom Splash Screen and a native-optimized WebView shell.
- **Native Integration**: Implements Immersive Sticky Mode for a dedicated, fullscreen operator experience.

---

## ⚙️ Installation & Setup

### 1. Backend Service
1. **Prepare Environment:**
   ```bash
   cd Backend
   python -m venv venv
   source venv/bin/activate  # Or venv\Scripts\activate on Windows
   ```
2. **Install Dependencies:**
   ```bash
   pip install -r app/requirements.txt
   ```
3. **Database Config:** Ensure `serviceAccountKey.json` is present in the `Backend/` root.
4. **Run:**
   ```bash
   uvicorn app.main:app --reload --port 8006
   ```

### 2. Web Dashboard
1. **Install:**
   ```bash
   cd gridguard_ui
   npm install
   ```
2. **Environment:** Create a `.env.local` pointing to your backend:
   ```env
   NEXT_PUBLIC_API_URL=http://localhost:8006
   ```
3. **Run:**
   ```bash
   npm run dev
   ```

### 3. Flutter Mobile
1. **Get Packages:**
   ```bash
   cd grid_guard
   flutter pub get
   ```
2. **Run:** Connect a device and execute:
   ```bash
   flutter run
   ```

---

## 🌐 Deployment Architecture

- **Frontend:** Automatically deployed via **Vercel** with global edge caching.
- **Backend Access:** Uses **Ngrok** tunnels to provide a secure public URL for the mobile app to reach the local ML server.
- **Persistence:** **Firestore** provides a globally distributed database that synchronizes history across all devices in real-time.

---

## 📈 System Workflow
1. **Telemetry Ingestion:** `stream_manager` reads feeder data.
2. **Feature Engineering:** Data is normalized and time-series features are calculated.
3. **Inference:** The data passes through the **Chained Pipeline**.
4. **Action:** If a fault is found, the system calculates ETR, saves to Firestore, and pushes a **Critical Alert** to all UI clients via SSE.
5. **Recovery:** Operators use the Localization coordinates and ETR estimates to dispatch teams and manage grid load.

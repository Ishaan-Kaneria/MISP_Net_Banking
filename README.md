# Arth-AI

Arth-AI is a mobile-first banking demo for Bharat: a mocked UPI ledger, explainable fraud protection, behavioral segments, vernacular support, and ethics-first offers.

## Run locally

### Backend

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python -m app.seed
uvicorn app.main:app --reload --port 8000
```

For schema changes, run migrations from the `backend` directory:

```powershell
alembic upgrade head
```

Run the focused backend tests from the `backend` directory:

```powershell
python -m pytest
```

Seeded demo logins use PIN `1234`:

| Persona | Phone | Story |
| --- | --- | --- |
| Ramesh Shah | `9000000001` | Saver, Gujarati |
| Priya Verma | `9000000002` | First job, Hindi |
| Amit Kumar | `9000000003` | Stress and grace support |
| Meena Iyer | `9000000004` | Medical expense |

### Frontend

```powershell
cd frontend
npm install
npm run dev
```

The app runs at `http://localhost:3000` and calls the API at `http://localhost:8000`.

### Docker

```powershell
docker compose up --build
```

The Compose stack starts PostgreSQL with pgvector, applies Alembic migrations, and starts the API and web app. The API seeds demo personas idempotently on startup. Local Python development defaults to SQLite so the UI and API can be explored without Docker.

Fraud scoring uses a deterministic IsolationForest trained on synthetic normal transactions at application boot. Hard fraud rules remain an independent final gate, so model behavior can never weaken a rule-based block.

Life-stage scoring uses an XGBoost multiclass model trained from synthetic aggregates at boot when `xgboost` is installed, with a deterministic rule fallback for lightweight local development.

Chat messages are persisted in PostgreSQL/SQLite and responses include the policy documents used by the lightweight retrieval layer. Add a Gemini or Groq key later for live multilingual generation without changing the API contract.

When `GEMINI_API_KEY` is set, the general chat path calls Gemini server-side with retrieved policy context. Balance and stressed-credit decisions remain handled by deterministic FastAPI tools and ethics rules before the model is reached.

Chat responses include an `llm:gemini` or `llm:<fallback_reason>` trace so a deployment can distinguish a live Gemini response from the deterministic fallback. Set `GEMINI_API_KEY` and `LLM_MODEL=gemini-2.5-flash` in the backend environment to enable Gemini; never put the key in the frontend.

## Product boundaries

Identity, UPI, DigiLocker, WhatsApp, and customer funds are mocked. No Aadhaar bytes or real payment credentials are accepted. Fraud and ethics decisions happen server-side; the chat assistant cannot bypass them.

## Decision models

The fraud and customer-segmentation decision layer is documented in [backend/ML_MODEL_README.md](backend/ML_MODEL_README.md). It covers the decision-time feature contract, hard-rule precedence, synthetic training, evaluation, audit logging, and retraining commands.

To retrain the saved artifacts:

```powershell
cd backend
.\.venv\Scripts\python.exe scripts\train_models.py
```
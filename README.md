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

The Compose stack starts PostgreSQL with pgvector, the API, and the web app. The API seeds demo personas idempotently on startup. Local Python development defaults to SQLite so the UI and API can be explored without Docker.

Fraud scoring uses a deterministic IsolationForest trained on synthetic normal transactions at application boot. Hard fraud rules remain an independent final gate, so model behavior can never weaken a rule-based block.

## Product boundaries

Identity, UPI, DigiLocker, WhatsApp, and customer funds are mocked. No Aadhaar bytes or real payment credentials are accepted. Fraud and ethics decisions happen server-side; the chat assistant cannot bypass them.
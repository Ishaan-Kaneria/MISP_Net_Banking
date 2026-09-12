# MISP Bank Deployment Guide: Render (simplest option)

This is the fastest path to a live backend for a hackathon demo — no CLI,
no separate database provider, no cloud IAM setup. Render reads
`render.yaml` at the repo root and provisions the API and its Postgres
database together from one blueprint.

## Backend: Render Blueprint

1. Push this repo (or your fork) to GitHub if it isn't already there.
2. Open `https://dashboard.render.com` -> **New** -> **Blueprint**.
3. Select this repository. Render detects `render.yaml` automatically and
   shows two resources: the `mispbank-backend` web service and the
   `mispbank-db` Postgres database.
4. Click **Apply**. First deploy takes a few minutes (Postgres provisions,
   then the Docker image builds and `alembic upgrade head` runs against it
   before the API starts).
5. Once live, copy the service URL — something like
   `https://mispbank-backend-xxxx.onrender.com`. Confirm it with:

```text
https://mispbank-backend-xxxx.onrender.com/health
```

Free-plan services spin down after inactivity; the first request after a
quiet period will be slow while it wakes up. That's expected, not a bug.

### Optional: live chatbot replies

By default `/chat` falls back to built-in canned responses (no external
call). To use Gemini instead, open the `mispbank-backend` service in Render
-> **Environment** -> set `GEMINI_API_KEY` to a key from
`https://aistudio.google.com/app/apikey`, then redeploy.

## Frontend: wherever you're hosting it

1. Set `NEXT_PUBLIC_API_URL` to the backend URL from step 5 above, at
   build time (Vercel/Render/Azure Static Web Apps all support this as a
   project environment variable), or in `frontend/.env.local` for a local
   build.
2. Deploy or rebuild the frontend, and copy its resulting URL.
3. Back in Render, open `mispbank-backend` -> **Environment** -> set
   `CORS_ORIGINS` to that exact frontend URL (no trailing slash) -> save,
   which triggers a redeploy.

Without step 3 the API works (`/health` responds) but the browser blocks
every request from the frontend with a CORS error — if login or the
dashboard silently fails to load data, this is the first thing to check.

## Cost note

Same warning as the Azure/Neon path: no provider guarantees zero cost
forever. Render's free web service and free Postgres are enough for a
demo; delete the blueprint's resources afterward if you don't plan to
keep them running.

# Deployment loose ends (checked this session)

## What's actually deploying `main` for this repo

The handoff's deployment notes (Render blueprint, `render.yaml`, `docs/DEPLOYMENT_RENDER.md`)
describe the **fork's** (`Ishaan-Kaneria/HackOut-26`) deployment setup. **This repo**
(`snehpatel05/HackOut-26`) has its own, different, already-working pipeline:
`.github/workflows/hackout-26-AutoDeployTrigger-585a3414-a94d-468a-83a3-5837f2f5565f.yml`
builds `backend/Dockerfile` on every push to `main` and deploys it straight to an **Azure
Container App** named `hackout-26` (resource group `hackout-26`, managed environment
`managedEnvironment-hackout26-b494`, region Central India).

Confirmed via the Actions API this session: both Phase 5 and Phase 6 pushes to `main`
triggered this workflow and it built/pushed/deployed successfully (run
[#15](https://github.com/snehpatel05/HackOut-26/actions/runs/34718741927), completed
`success`; run #16 for the Phase 6 push was still finishing as this was written — check
the Actions tab if you want its final status). So the "Vercel + Azure auto-deploy pipeline"
the handoff expected to "pick this up automatically" is real and did.

## What's still open

- **No live URL confirmation.** This session has no Azure credentials or portal access, so
  there's no way to look up the Container App's actual public FQDN (it isn't printed in the
  workflow logs — only internal resource names) and this sandbox's outbound network is also
  allowlisted, so a guessed `*.azurecontainerapps.io` URL likely couldn't be reached anyway.
  **If you paste the live backend URL**, the `/health` and `/wallet/topup/config` curl checks
  the handoff wanted can be done directly. Same story for whatever frontend is live (Vercel,
  per the handoff) — need the URL to check it.
- **`CORS_ORIGINS`**: still defaults to `http://localhost:3000` in `backend/app/config.py`
  and `render.yaml` (the latter is for the fork's unused Render path, not this repo's real
  Azure deploy). The Azure Container App's actual env vars aren't set by this GitHub Actions
  workflow at all (it only pushes a new image via `az containerapp update -i ...`, no
  `--set-env-vars`) — they must already be configured directly on the Container App itself,
  the same way the handoff describes Razorpay's keys being entered directly into Render's
  dashboard rather than committed anywhere. This session can't see or change that from here;
  once you have both the live frontend and backend URLs, confirm `CORS_ORIGINS` on the
  Container App matches the frontend's exact URL (no trailing slash).
- **Stale branches**: checked this repo directly (`git ls-remote`) — only `main` exists here.
  The stale/mergeable branches the handoff flagged (`upstream-sync-attempt`,
  `claude/ecstatic-turing-obnzx7`) live on the fork (`Ishaan-Kaneria/HackOut-26`), which isn't
  in this session's scope to touch. Nothing to clean up on this repo.

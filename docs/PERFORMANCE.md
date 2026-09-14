# Phase 5 — Performance findings

Profiled before changing anything, per the standing rule for this phase. Method:
`cProfile` + wall-clock timing around `app.pipeline.run_pipeline()` called directly
(bypassing HTTP/TestClient thread-pool overhead, which otherwise dominates any
timing taken through `TestClient`) and around app startup, against a fresh SQLite
DB with the seeded personas. Scripts aren't checked in (throwaway), but the
methodology and numbers below are reproducible from `backend/scripts/train_models.py`
and `backend/app/pipeline.py` directly.

## Suspects from the handoff, checked

1. **`seed()` / `create_all()` running on every app startup** — partly true, split into two different costs:
   - `Base.metadata.create_all(engine)` was unconditional on every boot. In production the Docker
     `CMD` already runs `alembic upgrade head` before `uvicorn` starts, so this was a fully redundant
     schema-reflection round-trip to Postgres on *every single cold start* — and Render's free tier
     spins the service down between requests, so cold starts are frequent, not rare. **Fixed**: now
     only runs when the engine is SQLite (local dev / tests, which have no migration step).
   - `seed()` itself: cheap (~3ms) once the 4 personas already exist — it does one `SELECT` per
     persona and skips. The *first-ever* run against an empty DB costs ~1.1s, and profiling shows
     **~1.1s of that is `passlib`'s bcrypt hashing** of the 4 demo PINs (`hash_pin`, ~280ms/call).
     That's bcrypt's cost factor working as intended (deliberately slow to resist brute force) —
     not a bug, and it's paid once per environment's lifetime, not per request or per restart.
     **Left as-is.**

2. **`run_pipeline` scanning up to 100 rows of transaction history on every `/txn` call** — real,
   but confirmed **not** the dominant cost: with the classifier fixed below, this whole path
   (history query + all the `spend_7d`/`savings_rate`/`missed_emi`/etc. feature recomputation from
   scratch) is a few ms against a 100-row cap. **Left as-is** — a single-pass refactor would save
   microseconds here, not milliseconds, and isn't worth the risk of subtly changing any of those
   aggregates.

3. **ML models retraining from scratch on cold start** — checked and **confirmed false**, as the
   handoff suspected: all three `.joblib` files are committed and present, so `app/ml/fraud.py` and
   `app/ml/segment.py` both hit the `joblib.load(...)` branch, never the `_model()`/`.fit(...)`
   fallback. Not a startup cost at all.

## The actual dominant cost (not on the handoff's suspect list)

Profiling `run_pipeline()` in a loop pointed at one thing: **`fraud_classifier.joblib`'s
`RandomForestClassifier.predict_proba()`**, called once per `/txn`. It accounted for the large
majority of the ~26ms average per-transaction time. The forest shipped with **320 trees**, and
scikit-learn's forest inference re-validates/dispatches once per tree per call — for a
single-row prediction (this app never batches; it scores one transaction at a time), that
per-tree overhead is pure latency with no batching to amortize it over.

Retrained `fraud_classifier.joblib` via `backend/scripts/train_models.py` (`RandomForestClassifier`)
at several tree counts and compared held-out precision/recall/F1/PR-AUC/ROC-AUC and single-row
`predict_proba` latency:

| n_estimators | precision | recall | f1 | pr_auc | roc_auc | ms/predict |
|---|---|---|---|---|---|---|
| 320 (previous) | 0.9788 | 0.6773 | 0.8006 | 0.7214 | 0.8347 | ~16.6 |
| **100 (new)** | 0.9788 | 0.6773 | 0.8006 | 0.7215 | 0.8349 | ~5.3 |
| 60 | 0.9788 | 0.6773 | 0.8006 | 0.7196 | 0.8321 | ~3.3 |

Precision/recall/F1 are **bit-for-bit identical** across every tree count tested (the decision
threshold is re-tuned per model, and this synthetic fraud rule is simple enough that fewer trees
fit it just as well); PR-AUC/ROC-AUC move by <0.001. **Shipped `n_estimators=100`**: ~3x faster
per transaction with no measurable accuracy cost, keeping headroom above the 60-tree point where
AUC starts drifting a bit more. Re-run `python backend/scripts/train_models.py` and re-check
`backend/data/synthetic/reports/metrics.json` if the training data or labels ever change — the
"accuracy is insensitive to tree count" result is a property of *this* synthetic frame, not a
general fact about the model.

End-to-end effect, `run_pipeline()` direct-call average over 50 transactions on the same warmed
process: **~26.5ms → ~14.9ms** (~44% faster). The remainder is now a fairly flat mix of ORM/SQLite
overhead spread across the same feature-recomputation and commit work described in suspect #2
above — no other single hotspot remains.

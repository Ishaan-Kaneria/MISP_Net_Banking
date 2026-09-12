FROM python:3.12-slim
WORKDIR /app
# Unlike uvicorn (which inserts the CWD into sys.path itself to support
# `uvicorn app.main:app`), the `alembic` console script does not — its
# migrations/env.py does `from app.config import settings` and fails with
# ModuleNotFoundError unless the app package is importable some other way.
# Set PYTHONPATH explicitly so both commands in the CMD below resolve it.
ENV PYTHONPATH=/app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY app ./app
COPY alembic.ini .
COPY migrations ./migrations
CMD ["sh", "-c", "alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port 8000"]
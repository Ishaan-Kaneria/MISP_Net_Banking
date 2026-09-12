import os
import tempfile

# Point the app at an isolated, throwaway SQLite file for the whole test
# session, and keep Razorpay unconfigured by default — set *before* any
# `app.*` module is imported anywhere in the suite, since app.config.settings
# is instantiated once at first import and cached from then on. Individual
# tests that need Razorpay "configured" monkeypatch `app.config.settings`
# directly rather than relying on env vars at this point.
_db_fd, _db_path = tempfile.mkstemp(suffix=".db")
os.close(_db_fd)
os.environ["DATABASE_URL"] = f"sqlite:///{_db_path}"
os.environ["RAZORPAY_KEY_ID"] = ""
os.environ["RAZORPAY_KEY_SECRET"] = ""

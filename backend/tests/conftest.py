"""Shared pytest fixtures & env loading for backend tests."""
import os
from dotenv import load_dotenv

# Ensure backend .env is loaded so tests can read REACT_APP_BACKEND_URL etc.
load_dotenv("/app/backend/.env")

# For tests that don't have REACT_APP_BACKEND_URL in backend .env,
# fall back to PUBLIC_FRONTEND_URL which is the same public origin.
if not os.environ.get("REACT_APP_BACKEND_URL"):
    pub = os.environ.get("PUBLIC_FRONTEND_URL")
    if pub:
        os.environ["REACT_APP_BACKEND_URL"] = pub

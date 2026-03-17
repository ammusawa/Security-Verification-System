"""Run the Flask API (backend)."""
import os
from pathlib import Path

_env = Path(__file__).resolve().parent / ".env"
if _env.exists():
    from dotenv import load_dotenv
    load_dotenv(_env)

from app import create_app

app = create_app()

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=True)

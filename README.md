# Security Verification System

Context-aware multi-factor security verification: **password** (what you know), **OTP by email** (what you have), **facial recognition** (who you are). Verification level depends on IP, browser, and location.

## Project structure

```
Security Verification System/
├── backend/          # Flask API (Python)
├── frontend/         # Next.js app (React)
├── database/         # MySQL schema and docs
└── README.md
```

## Prerequisites

- **Python 3.8+** (backend)
- **Node.js 18+** (frontend)
- **MySQL 8** (database)

## 1. Database (MySQL)

```bash
# Create database
mysql -u root -p -e "CREATE DATABASE security_verification CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"

# Apply schema
mysql -u root -p security_verification < database/schema.sql
```

See `database/README.md` for more options.

## 2. Backend

```bash
cd backend
python -m venv venv
# Windows:
venv\Scripts\activate
# macOS/Linux:
# source venv/bin/activate

pip install -r requirements.txt
```

Copy `backend/.env.example` to `backend/.env` and set:

- **MySQL:** `MYSQL_USER`, `MYSQL_PASSWORD`, `MYSQL_HOST`, `MYSQL_DATABASE` (or `DATABASE_URI`)
- **Email (OTP):** `MAIL_SERVER`, `MAIL_PORT`, `MAIL_USE_TLS`, `MAIL_USERNAME`, `MAIL_PASSWORD`, `MAIL_DEFAULT_SENDER`
- **CORS:** `CORS_ORIGINS=http://localhost:3000`
- **Session:** `SECRET_KEY`

Run the API:

```bash
python run.py
```

API runs at **http://localhost:5000**.

## 3. Frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend runs at **http://localhost:3000**. It proxies `/api/*` to the backend (see `frontend/next.config.js`).

## 4. Run both

1. Start **MySQL**.
2. Start **backend:** `cd backend && python run.py`
3. Start **frontend:** `cd frontend && npm run dev`
4. Open **http://localhost:3000** — login, register, setup MFA, dashboard.

## API (backend)

- `POST /api/register` — create user
- `GET /api/me` — current user (session)
- `POST /api/logout` — clear session
- `POST /api/login/start` — start login, get `session_token` and required steps
- `POST /api/login/verify-password` — verify password
- `POST /api/login/verify-otp` — verify email OTP
- `POST /api/login/verify-face` — verify face image
- `POST /api/login/complete` — complete login, set session cookie
- `POST /api/setup/face` — register face for user

## Old app/ folder

The previous single-folder app (Flask + templates + SQLite) is no longer used. You can remove `app/`, `config.py`, `run.py`, `requirements.txt`, `static/`, `templates/`, `instance/` from the project root if you have fully switched to this structure.

# Auth-as-a-Service API key test client

A minimal standalone page to verify that your **API key** works against the Security Verification System (auth-as-a-service) running on localhost.

## Quick start

1. **Start the auth backend** (default port 5000):
   ```bash
   cd backend
   python -m flask run --host=0.0.0.0 --port=5000
   ```

2. **Serve this test page** on another port so the browser can load it:
   - **Option A – Live Server (VS Code):** Right-click `index.html` → “Open with Live Server”. It usually runs at `http://127.0.0.1:5500`.
   - **Option B – Python:**
     ```bash
     cd test-client
     python -m http.server 5500
     ```
     Then open: http://localhost:5500

3. **Allow CORS** for the test page origin. In `backend/.env` set:
   ```env
   CORS_ORIGINS=http://localhost:3000,http://localhost:5500,http://127.0.0.1:5500
   ```
   Use the exact URL you use to open the test page (e.g. `http://127.0.0.1:5500` if that’s what’s in the address bar).

4. **Get an API key** from the system:
   - Log in as **system admin** → create an App → create an API key, or  
   - Log in as **app admin** → API Keys → create a key.  
   Copy the key (it’s shown only once).

5. On the test page, leave **API base URL** as `http://localhost:5000` (or your backend URL), paste the **API key**, and click **Test API key**.

If the key is valid, you’ll see “API key is valid” and the app name. Otherwise you’ll see the error (e.g. invalid key, app deactivated, or CORS).

## What it calls

The page sends:

- **Request:** `GET /api/v1/ping`  
- **Header:** `X-API-Key: <your key>`

The backend validates the key and returns the app id and name. No user or login flow is involved.

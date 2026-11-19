# RDS Lead Finder

Internal lead discovery tool for Rayyaan Digital Studio. Search Google Maps by category and place, see name, phone, website, address and Maps link in one table, save the businesses worth contacting, and export them.

The deployed app is private: one administrator signs in with a username and password, and every data/API route requires a signed HTTP-only session cookie.

- **Frontend:** React 18, Vite, Tailwind CSS, Lucide (`frontend/`)
- **Backend:** FastAPI, SQLAlchemy 2, Alembic, PostgreSQL (`backend/`)
- **Google:** Places API (New), Text Search for discovery, Place Details for saved leads

## How it handles Google's terms

Google's Places policies let you store a **Place ID** indefinitely, but prohibit storing or caching other Places content unless a specific exception applies. Google Maps Platform's terms also bar exporting or scraping Maps content for use outside its services, and list copying and saving business names and addresses as an example. So this app is built the compliance-first way:

| What | Where it lives |
|---|---|
| Place ID, your notes, timestamps | PostgreSQL `leads` table (the only thing stored) |
| Name, phone, website, address | Fetched live from Google when shown and not cached or written to the database |
| Exports (CSV / Excel) | Place ID, Google Maps link, your notes |

Results are shown with Google Maps attribution, and the app includes Terms and Privacy pages. Review those pages, add the deployment operator's contact details, and re-read the [Places API policies](https://developers.google.com/maps/documentation/places/web-service/policies) and [Maps Platform Terms of Service](https://cloud.google.com/maps-platform/terms) before public deployment or volume outreach.

## Cost notes

- A search uses **Text Search (New)** with a field mask of only the five lead fields (plus the international phone number for the tap-to-call link). Phone and website are Enterprise-tier fields, so those searches bill at the Enterprise rate. Check current rates on Google's pricing page.
- Each search fetches up to 3 pages of 20 results. Google caps a query at roughly 60 results, so split large cities by locality or category.
- Opening or refreshing **Saved leads** makes one Place Details call per lead on the page (25 by default). Use the 25 per page default and set a budget alert in Google Cloud.

## Setup

### 1. Google Cloud
1. Create a project and enable billing.
2. Enable **Places API (New)**.
3. Create an API key and restrict it to *Places API (New)* only. Keep it on the backend; the frontend never sees it.
4. Add a budget alert.

### 2. Backend
```bash
cd backend
python3 -m venv .venv && source .venv/bin/activate    # Windows: py -m venv .venv && .venv\Scripts\activate
python -m pip install -r requirements.txt
cp .env.example .env                                   # fill in the values
python scripts/generate_auth_config.py --write-env      # choose the local login password and update .env
createdb rds_lead_finder                               # or use any PostgreSQL URL in DATABASE_URL
alembic upgrade head
uvicorn app.main:app --reload --port 8000
```
Run the tests (they use a temporary SQLite file and a fake Google transport, no key needed): `python -m pytest`

### 3. Frontend
```bash
cd frontend
npm install
npm run dev          # http://localhost:5173, proxies /api to localhost:8000
```

## Deploy

The production Docker image builds the React frontend and serves it from FastAPI. You therefore deploy one Render service and use one `onrender.com` URL; Vercel is not required.

1. Run `python3 backend/scripts/generate_auth_config.py`. Keep the password you chose and copy the generated `ADMIN_PASSWORD_HASH` output. Render needs the complete value beginning with `$argon2id$`, not your plain-text password.
2. Create a **private** empty GitHub repository, then push this folder. The included `.gitignore` keeps `backend/.env` and other local secrets out of Git:
   ```bash
   git init
   git add .
   git commit -m "Prepare private deployment"
   git branch -M main
   git remote add origin https://github.com/ManaazirRayyaan/RDS-leads-.git
   git push -u origin main
   ```
3. In Render, choose **New → Blueprint**, connect the repository, and select its root `render.yaml`.
4. When Render asks for secret values, set `GOOGLE_MAPS_API_KEY` and paste the complete generated hash into `ADMIN_PASSWORD_HASH` without quotes. If you change it later, save the environment change and restart/redeploy the service.
5. Deploy the Blueprint. Render generates the session-signing secret, creates PostgreSQL, runs migrations, and provides the single app URL.
6. Open that URL and sign in with username `admin` and the password you chose.

`AUTH_COOKIE_SECURE=true` and API docs are disabled by the production Blueprint. To change the username, edit `ADMIN_USERNAME` in `render.yaml` before deploying.

The supplied Blueprint uses Render's free web service and free Postgres plan for evaluation. Free Postgres expires after 30 days and has no backups; Render currently provides a 14-day grace period to upgrade before deletion. For permanent use, change the database plan from `free` to `256mb` in `render.yaml` before deploying, or upgrade it before the trial database expires.

### Vercel backend alternative

If you deploy only the FastAPI backend to Vercel, set the Vercel project's **Root Directory** to `backend`. The included `index.py` is the serverless entrypoint and `.python-version` selects the supported Python 3.13 runtime. Add these project environment variables before deploying:

- `DATABASE_URL`: the external/pooled PostgreSQL connection string supplied by your database provider. A local socket URL does not work on Vercel.
- `GOOGLE_MAPS_API_KEY`
- `ADMIN_USERNAME` (normally `admin`)
- `ADMIN_PASSWORD_HASH`
- `SESSION_SECRET` (at least 32 random characters)
- `AUTH_COOKIE_SECURE=true`
- `ENABLE_API_DOCS=false`
- `CORS_ORIGINS`: the exact frontend URL, such as `https://your-frontend.vercel.app`

Run `alembic upgrade head` against that `DATABASE_URL` once before using saved leads. For the supplied separate frontend project, `frontend/vercel.json` proxies `/api/*` to the production backend so authentication remains same-origin. Update that rewrite destination if the backend project domain changes.

## API

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/auth/login` | Verify the administrator password and create a session |
| GET | `/api/auth/me` | Check the current signed-in administrator |
| POST | `/api/auth/logout` | Clear the current session |
| POST | `/api/search` | Text Search with pagination, deduped by Place ID |
| GET | `/api/leads?limit=&offset=&q=` | Saved leads page with live details (`q` searches notes) |
| GET | `/api/leads/ids` | Saved Place IDs |
| POST | `/api/leads` | Save Place IDs (duplicates skipped) |
| PATCH / DELETE | `/api/leads/{id}` | Edit notes / remove |
| POST | `/api/leads/bulk-delete` | Remove several |
| POST | `/api/export` | `format` csv or xlsx, `scope` results, selected or saved |

## Known limits
- One administrator account; this is intentionally not a multi-user system.
- Login throttling is held in process memory. It fits the supplied single-instance deployment, not a horizontally scaled service.
- Saved-lead search, filter and sort apply to the page on screen, because details are fetched per page to control cost.
- Google can retire or change a Place ID. Those leads show "Listing no longer found on Google"; remove them or search again.

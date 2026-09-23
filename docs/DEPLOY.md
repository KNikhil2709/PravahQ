# Deploying to Vercel

This project is two parts, so it becomes **two Vercel projects from the same repository**:

| Vercel project | Root directory | What it is |
|---|---|---|
| `pravah-route-api` | `backend` | FastAPI optimisation service (Python runtime) |
| `pravah-route` | `frontend` | Vite + React dashboard (static site) |

Everything below works on the free **Hobby** plan. Total time: about 15 minutes.

---

## Before you start

- A GitHub account with this project pushed to a repository.
- A Vercel account (sign in with GitHub at <https://vercel.com>).
- Git installed locally.

If the code is not on GitHub yet:

```bash
cd pravah-route
git init
git add .
git commit -m "PravahAI Route Optimizer - Round 2 prototype"
git branch -M main
git remote add origin https://github.com/<your-username>/<your-repo>.git
git push -u origin main
```

---

## Step 1 — Deploy the backend

1. Go to <https://vercel.com/new> and click **Import** next to your repository.
2. **Root Directory**: click **Edit** and choose **`backend`**. This matters: it tells Vercel to treat the backend folder as the project.
3. Vercel detects **FastAPI** automatically (it finds the `app` object in `api/main.py`). Leave the build settings untouched.
4. Click **Deploy** and wait about a minute.
5. Copy the deployment URL, for example `https://pravah-route-api.vercel.app`.

**Check it works** — open these in a browser:

- `https://<your-backend>.vercel.app/api/health` → should show `{"status":"ok", ...}`
- `https://<your-backend>.vercel.app/docs` → the interactive API documentation
- `https://<your-backend>.vercel.app/api/network` → the demo road network as JSON

If the first request takes a few seconds, that is a cold start and is normal.

---

## Step 2 — Deploy the frontend

1. Go to <https://vercel.com/new> again and import **the same repository** a second time.
2. **Root Directory**: choose **`frontend`**.
3. Framework Preset should say **Vite**. Leave the build command and output directory as they are.
4. Expand **Environment Variables** and add:

   | Name | Value |
   |---|---|
   | `VITE_API_URL` | `https://<your-backend>.vercel.app` |

   Use the backend URL from Step 1, with **no trailing slash**.
5. Click **Deploy**.
6. Open the resulting URL, for example `https://pravah-route.vercel.app`.

> `VITE_API_URL` is read at build time, so if you change it later you must redeploy the
> frontend (**Deployments → ⋯ → Redeploy**).

---

## Step 3 — Restrict the backend to your frontend

The backend currently accepts requests from anywhere. Lock it down:

1. Open the **backend** project → **Settings → Environment Variables**.
2. Add:

   | Name | Value |
   |---|---|
   | `ALLOWED_ORIGINS` | `https://<your-frontend>.vercel.app` |

   To keep Vercel preview deployments working too, list several origins separated by commas.
3. Go to **Deployments → ⋯ → Redeploy** so the new variable takes effect.

---

## Step 4 — Test the deployed app

Open the frontend URL and walk the demo:

1. The hero loads with the animated background.
2. **Start Optimising** → the road network appears (this calls the backend).
3. **Optimise routes** → Pareto plans appear within a few seconds.
4. Click each profile card → the map route changes.
5. **Simulate traffic change** → the before/after comparison appears.
6. Visit **Benchmark** → **Run benchmark** with 5 seeds.
7. Open `https://<your-frontend>.vercel.app/method` directly in a new tab: it must load, not 404. (`frontend/vercel.json` handles this.)

---

## Updating the deployed app

Both projects redeploy automatically on every push:

```bash
git add .
git commit -m "Your change"
git push
```

Pull requests and branches get their own preview URLs.

---

## Command-line alternative

```bash
npm i -g vercel

cd backend   && vercel --prod   # answer: root directory = ./ , project = pravah-route-api
cd ../frontend && vercel --prod # then set VITE_API_URL in the dashboard and redeploy
```

---

## Things to know before demonstrating

**Cold starts.** After a few idle minutes, the first request takes a few seconds while the
function wakes up. Before judging, open the app once to warm it up.

**Serverless has no memory between requests.** Each request may hit a different instance, so
a run stored by one request may be gone for the next. The frontend therefore sends the
original scenario with "Simulate traffic change", and the backend rebuilds that run exactly
(every run is seeded and deterministic) before applying the change. It costs about 1.5 s more
and is covered by `test_traffic_change_survives_a_lost_run_store`.

**Time limits.** Hobby functions can run up to 60 seconds (`backend/vercel.json` sets this).
A normal optimisation takes 1–2 s. The benchmark takes roughly 2 s per run: 5 seeds means
10 runs, about 20 s. Keep the benchmark at 5 seeds or fewer when deployed, and raise
generations only on your own machine.

**Cost.** Everything here fits in the free tier. There is no database and no paid add-on.

**If you want an always-on backend** (no cold starts, longer runs), deploy `backend` to a
service that keeps a process running, such as Render or Railway, with the start command:

```bash
uvicorn api.main:app --host 0.0.0.0 --port $PORT
```

Then point `VITE_API_URL` at that URL instead. The frontend stays on Vercel either way.

---

## Troubleshooting

| Symptom | Cause and fix |
|---|---|
| "The optimisation service at … is not reachable" | `VITE_API_URL` is wrong, missing, or has a trailing slash. Fix it and redeploy the frontend. |
| Browser console shows a CORS error | `ALLOWED_ORIGINS` does not match your frontend URL exactly (including `https://`). Update it and redeploy the backend. |
| `/method` or `/benchmark` 404 on refresh | `frontend/vercel.json` is missing from the deployment. It must sit in the `frontend` folder. |
| Backend build fails with "No entrypoint found" | Root Directory is not set to `backend`, so Vercel cannot find `api/main.py`. |
| Backend build fails on dependencies | `backend/requirements.txt` should list only fastapi, numpy, networkx and pydantic. Dev-only packages belong in `requirements-dev.txt`. |
| Benchmark request times out | Too many seeds for a 60 s limit. Use 5 or fewer, or fewer generations. |
| First request after idle is slow | Cold start. Open the app once before demonstrating. |

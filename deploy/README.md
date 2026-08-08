# Deploying Plately

Two pieces, deployed separately: a Python API and a static front-end bundle.

## Before you start

You need a trained model. Until `ml/artifacts/` holds one, `POST /classify`
returns 503 with a message explaining why — everything else (accounts, history,
the daily summary) works without it, so it is perfectly reasonable to deploy
early and add the model later.

```bash
python ml/train.py                # produces model.keras + class_indices.json
python ml/export_tflite.py        # produces model.tflite  ← deploy this one
```

## Backend

### Which inference runtime

| | Installed size | Needs | Use for |
|---|---|---|---|
| `requirements-serve.txt` | ~50 MB | `model.tflite` | **Deployment** |
| `requirements-ml.txt` | ~600 MB | `model.keras` | Training, and local work |

The predictor picks whichever it finds, preferring TFLite. Full TensorFlow on a
512 MB instance will be killed by the OOM reaper while it loads; LiteRT fits
comfortably. Unless you have a specific reason, deploy the TFLite build.

### Docker

Build from the repository root, not from `backend/` — the image copies the
model in from `ml/artifacts/`, which is outside the backend directory.

```bash
docker build -f backend/Dockerfile -t plately-api .                    # TFLite
docker build -f backend/Dockerfile --build-arg INFERENCE=full -t plately-api .
```

The default build comes out at about **358 MB**, model included.

The model travels inside the image, at `/models/model.tflite`. That is a
deliberate choice for hosts that build from git and cannot mount a file the
repository does not contain — Railway among them. It does mean **a better
model requires a rebuild**, which is a fair trade for a deploy that cannot
silently come up with no model at all.

```bash
docker run -p 8000:8000 \
  -e SECRET_KEY="$(python -c 'import secrets; print(secrets.token_urlsafe(32))')" \
  -e CORS_ORIGINS="https://your-frontend.example.com" \
  -v plately-data:/app/data \
  -e DATABASE_URL="sqlite:////app/data/plately.db" \
  -e MEDIA_ROOT=/app/data/media \
  plately-api
```

To try a different model without rebuilding, mount over the baked-in one:
`-v "$PWD/ml/artifacts/model.tflite:/models/model.tflite:ro"`.

### Without Docker

```bash
pip install -r backend/requirements.txt -r backend/requirements-serve.txt
cd backend && uvicorn app.main:app --host 0.0.0.0 --port "$PORT" --workers 2
```

Each worker loads its own copy of the model, so worker count multiplies memory.

### Required environment

| Variable | Why |
|---|---|
| `SECRET_KEY` | **Mandatory.** The app refuses to start without a real one unless `DEBUG=true`. Anyone with the default can mint a token for any account. |
| `DEBUG` | Leave unset. Defaults to `false`. |
| `CORS_ORIGINS` | The front end's origin, comma separated. Without it every browser request is blocked. |
| `DATABASE_URL` | Only if moving off SQLite. |

See `backend/.env.example` for the rest.

### Persistence

Two things are written to disk: the SQLite file and uploaded meal photos under
`media/`. On a host with an ephemeral filesystem — which is most container
platforms — both vanish on every deploy. Either mount a volume for both, or
move to Postgres (`DATABASE_URL`) plus object storage for the photos.

This is the most common way a working deployment quietly loses all its data,
and nothing in the application will warn you.


## Railway

`railway.json` at the repository root already points Railway at
`backend/Dockerfile` and sets `/health` as the health check. Two services:
the API from this repo, and the front-end bundle on a static host.

### API service

1. New project → Deploy from GitHub repo → pick this repository.
   Railway reads `railway.json` and builds the Dockerfile. No Nixpacks
   guessing, no start command to configure — the image binds `$PORT` itself.

2. **Add a volume before the first real use**, mounted at `/app/data`. Railway
   allows one volume per service, which is why the database and the uploads
   are pointed into the same directory below. Without it, every deploy wipes
   every account and every uploaded photo — the app will not warn you.

3. Variables:

   | Variable | Value |
   |---|---|
   | `SECRET_KEY` | generate one: `python -c "import secrets; print(secrets.token_urlsafe(32))"` |
   | `CORS_ORIGINS` | the front end's URL, e.g. `https://plately.up.railway.app` |
   | `DATABASE_URL` | `sqlite:////app/data/plately.db` — note **four** slashes, three is a relative path |
   | `MEDIA_ROOT` | `/app/data/media` |
   | `WEB_CONCURRENCY` | `2`. Each worker loads its own copy of the model; drop to `1` if memory is tight |

   Do not set `PORT` — Railway assigns it.

4. Generate a domain (Settings → Networking), then check:

   ```bash
   curl https://your-api.up.railway.app/health           # {"status":"ok"}
   curl https://your-api.up.railway.app/classify/status  # {"ready":true,...}
   ```

   If `ready` is false, the `reason` field says exactly what is missing.

### Front end

Build with the API URL baked in, then deploy `frontend/dist/` as a static site:

```bash
cd frontend
VITE_API_URL=https://your-api.up.railway.app npm run build
```

Whichever static host you use, configure the SPA fallback — see below — and
then come back and set `CORS_ORIGINS` on the API to the front end's final URL.
That ordering is circular by nature: deploy the API, build the front end
against it, then update `CORS_ORIGINS` and let the API redeploy.

### Swapping in a better model

The model is inside the image, so:

```bash
cp ~/Downloads/model.tflite ml/artifacts/model.tflite
git add ml/artifacts/model.tflite && git commit -m "Better model" && git push
```

Railway rebuilds and redeploys on push. The volume is untouched, so accounts
and meal history survive.

## Frontend

```bash
cd frontend
VITE_API_URL=https://your-api.example.com npm run build
```

`dist/` is a static bundle — any static host will serve it. The API URL is
baked in at build time, not read at runtime, so a change means a rebuild.

The app uses client-side routing, so the host must rewrite unknown paths to
`index.html` or a refresh on `/history` will 404. On Netlify that is a
`_redirects` file containing `/* /index.html 200`; on Vercel a rewrite rule;
on nginx, `try_files $uri /index.html`.

## Checklist

- [ ] `SECRET_KEY` set to a generated value, not committed
- [ ] `CORS_ORIGINS` includes the deployed front-end origin
- [ ] `DEBUG` unset or false
- [ ] Volume mounted, with `DATABASE_URL` and `MEDIA_ROOT` pointed inside it
- [ ] `VITE_API_URL` pointed at the deployed API at build time
- [ ] SPA fallback configured on the static host
- [ ] `GET /health` returns `{"status":"ok"}`
- [ ] `GET /classify/status` returns `{"ready": true}` — if false, the `reason`
      field says exactly what is missing

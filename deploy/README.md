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

```bash
docker build -t plately-api backend/                    # TFLite, the default
docker build -t plately-api --build-arg INFERENCE=full backend/
```

The default build comes out at about **349 MB**.

The image does not contain the model — mount `ml/artifacts/` and point the
settings at it, or copy the artifacts in with your own build step. Note that
inside the container the default model paths resolve to `/ml/artifacts/`, so
setting them explicitly is the clearer option:

```bash
docker run -p 8000:8000 \
  -e SECRET_KEY="$(python -c 'import secrets; print(secrets.token_urlsafe(32))')" \
  -e CORS_ORIGINS="https://your-frontend.example.com" \
  -v "$PWD/ml/artifacts:/models:ro" \
  -e TFLITE_MODEL_PATH=/models/model.tflite \
  -e CLASS_INDEX_PATH=/models/class_indices.json \
  -v plately-data:/app/media \
  plately-api
```

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
- [ ] Volume mounted for the database and `media/`
- [ ] `VITE_API_URL` pointed at the deployed API at build time
- [ ] SPA fallback configured on the static host
- [ ] `GET /health` returns `{"status":"ok"}`
- [ ] `GET /classify/status` returns `{"ready": true}` — if false, the `reason`
      field says exactly what is missing

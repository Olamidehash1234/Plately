# Plately API

FastAPI backend for the food classification and dietary monitoring system:
authentication, meal photo upload, CNN inference, and per-user meal history.

## One-time system setup

This machine's Python ships without `pip` or `venv`. Install them once:

```bash
sudo apt install python3.13-venv python3-pip
```

## Setup

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env          # then set SECRET_KEY
```

`requirements.txt` is deliberately light — it excludes TensorFlow, so the API
installs in seconds and every endpoint except `/classify` works immediately.
Once you have a trained model, add inference support:

```bash
pip install -r requirements-ml.txt
```

## Running

```bash
source .venv/bin/activate
uvicorn app.main:app --reload --port 8000
```

- API: http://localhost:8000
- Interactive docs: http://localhost:8000/docs
- Health check: http://localhost:8000/health

The frontend expects the API at `http://localhost:8000` — see
`frontend/.env.example`.

## Layout

```
app/
  config.py        settings, read from environment / .env
  db.py            engine, session factory, declarative base
  models.py        User and Meal tables
  schemas.py       request/response models
  security.py      password hashing and JWT
  deps.py          shared FastAPI dependencies (current user, db session)
  data/            nutrition reference table
  ml/predictor.py  loads the trained model and runs inference
  routers/         auth, meals, classify
tests/             pytest suite
```

The training pipeline lives outside this package, in `../ml`. The backend only
consumes its output: a saved model and a class index file.

## Model availability

`/classify` needs two things that are not in version control: a trained model,
and a runtime that can execute it. There are two combinations, and the
predictor picks whichever it finds:

| Model file | Runtime | Install |
|---|---|---|
| `model.tflite` | LiteRT interpreter | `requirements-serve.txt` (~50 MB) |
| `model.keras` | full TensorFlow | `requirements-ml.txt` (~600 MB) |

TFLite is preferred when both are present, and is what deployment should use —
see `../deploy/README.md`. Training needs the full TensorFlow install either
way; `python ml/export_tflite.py` converts the result.

Until a model and a runtime both exist the endpoint returns `503` with a
message saying which piece is missing. Everything else — signup, login, upload,
history, daily summaries — works without a model, so the app can be built and
tested while training runs.

See `../ml/README.md` for how to train.

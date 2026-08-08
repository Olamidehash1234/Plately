# Plately

Photograph a meal, get its name and its nutrition. A convolutional neural
network recognises twelve dishes — six international, and six Nigerian ones
that no public dataset covers.

| | |
|---|---|
| **Frontend** | React 19, TypeScript, Vite, Tailwind |
| **Backend** | FastAPI, SQLAlchemy, SQLite |
| **Model** | MobileNetV2 transfer learning, Keras; served as TFLite |

## Running it

Everything routine is a `make` target. Run `make` on its own to list them and
to see the current state of the dataset and model.

```bash
make setup     # once: create backend/.venv, install Python and npm packages
make dev       # API on :8000, web app on :5173 — Ctrl-C stops both
make test      # 46 backend tests (pytest) + 126 frontend tests (vitest)
```

`make dev` is the one you want day to day. The API serves docs at
<http://localhost:8000/docs>.

If `make setup` fails on the venv, you need Python 3.11+ and Node 20+.

## Training the model

```bash
make pipeline  # fetch Food-101 -> build dataset -> train -> evaluate -> export
```

This runs on your machine and is slow without a GPU. `ml/colab_train.ipynb`
does the same thing on a free Colab T4 in a fraction of the time, and is how
the current model was trained — see `ml/README.md`.

Three parts of this project are not automated, because they cannot be:
photographing the Nigerian dishes, reviewing harvested images by eye, and
deciding what to shoot next from the confusion matrix.

## Layout

```
backend/    FastAPI application, tests, Dockerfile
frontend/   React app
ml/         dataset tooling, training, evaluation, export
deploy/     how to put it online
docs/       harvest review sheets
```

Each directory has its own README with the detail.

## Deploying

See `deploy/README.md`. The short version: build the frontend with
`VITE_API_URL` pointed at the API, serve `dist/` from any static host, and run
the backend from its Docker image with `SECRET_KEY` and `CORS_ORIGINS` set. The
model is mounted rather than baked into the image, so a better model can be
swapped in without rebuilding or redeploying the application.

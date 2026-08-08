# Plately — every routine command in one place.
#
#   make            what you can run, and what state the project is in
#   make setup      install backend and frontend dependencies
#   make test       the whole test suite, backend and frontend
#   make dev        run the API and the web app together
#   make pipeline   data -> train -> evaluate -> export, end to end
#
# Three parts of this project cannot be automated and are not pretended to be:
# photographing the Nigerian dishes, reviewing harvested images by eye, and
# training on Colab. `make pipeline` trains on this machine instead, which
# works but is slow without a GPU. See ml/README.md.

VENV     := backend/.venv
PY       := $(VENV)/bin/python
PIP      := $(VENV)/bin/pip
UVICORN  := $(VENV)/bin/uvicorn
PYTEST   := $(VENV)/bin/pytest

# Cap on Food-101 images per class. Keep it near the number of Nigerian photos
# you have, or the international classes swamp them.
LIMIT ?= 60

.DEFAULT_GOAL := help
.PHONY: help setup setup-backend setup-frontend test test-backend test-frontend \
        lint dev api web data train evaluate export pipeline model-status \
        dataset-status build clean

## ---------------------------------------------------------------- help

help:
	@echo "Plately"
	@echo
	@echo "  setup      install backend (venv) and frontend (npm) dependencies"
	@echo "  test       pytest + vitest"
	@echo "  lint       oxlint on the frontend"
	@echo "  dev        API on :8000 and web app on :5173"
	@echo "  pipeline   data -> train -> evaluate -> export  (slow without a GPU)"
	@echo "  build      production frontend bundle + backend Docker image"
	@echo "  clean      remove generated dataset, artifacts and build output"
	@echo
	@$(MAKE) --no-print-directory dataset-status
	@$(MAKE) --no-print-directory model-status

## ---------------------------------------------------------------- setup

setup: setup-backend setup-frontend

$(VENV):
	python3 -m venv $(VENV)

setup-backend: $(VENV)
	$(PIP) install -q -r backend/requirements.txt -r backend/requirements-dev.txt
	@echo "Backend ready. For training, also: $(PIP) install -r backend/requirements-ml.txt"

setup-frontend:
	cd frontend && npm install

## ---------------------------------------------------------------- checks

test: test-backend test-frontend

test-backend:
	cd backend && .venv/bin/pytest -q

test-frontend:
	cd frontend && npm run test

lint:
	cd frontend && npm run lint

## ---------------------------------------------------------------- running

# Both servers in one terminal. Make runs recipes with job control off, so the
# API's process id is captured explicitly rather than referred to as %1; the
# trap then stops it when you Ctrl-C, instead of leaving it bound to :8000.
dev:
	@echo "API  http://localhost:8000/docs"
	@echo "Web  http://localhost:5173"
	@echo
	@( cd backend && exec .venv/bin/uvicorn app.main:app --reload --port 8000 ) & \
	api=$$!; \
	trap 'kill $$api 2>/dev/null' EXIT INT TERM; \
	cd frontend && npm run dev

api:
	cd backend && .venv/bin/uvicorn app.main:app --reload --port 8000

web:
	cd frontend && npm run dev

## ---------------------------------------------------------------- model

data:
	$(PY) ml/fetch_food101.py
	$(PY) ml/prepare_data.py \
	    --food101 ml/raw_food101 \
	    --nigerian ml/raw_nigerian \
	    --limit-per-class $(LIMIT) \
	    --clean

train:
	$(PY) ml/train.py

evaluate:
	$(PY) ml/evaluate.py

export:
	$(PY) ml/export_tflite.py

pipeline: data train evaluate export
	@echo
	@echo "Done. The API picks the model up on its next start — try 'make dev'."

## ---------------------------------------------------------------- status

dataset-status:
	@if [ -d ml/raw_nigerian ]; then \
	    $(PY) ml/collect_nigerian.py status 2>/dev/null | tail -n +2 || true; \
	else \
	    echo "  No photographs yet: python ml/collect_nigerian.py init"; \
	fi

model-status:
	@if [ -f ml/artifacts/model.tflite ]; then \
	    echo "  Model: ml/artifacts/model.tflite ($$(date -r ml/artifacts/model.tflite '+%Y-%m-%d %H:%M'))"; \
	else \
	    echo "  Model: none yet — 'make pipeline', or train on Colab"; \
	fi

## ---------------------------------------------------------------- build

build:
	cd frontend && npm run build
	docker build -f backend/Dockerfile -t plately-api .

# model.tflite and class_indices.json are versioned and are what gets deployed,
# so they survive a clean. Everything else in artifacts/ is reproducible by
# `make pipeline`.
clean:
	rm -rf ml/dataset frontend/dist
	rm -rf ml/artifacts/reports ml/artifacts/model.keras ml/artifacts/training_history.csv
	@echo "Removed the dataset, the training outputs and the frontend bundle."
	@echo "Kept: ml/artifacts/model.tflite (deployed), ml/raw_nigerian (your photos)."

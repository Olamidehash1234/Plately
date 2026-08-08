# Backend image. The front end is a static bundle and is deployed separately —
# see deploy/README.md.
#
# Build from the REPOSITORY ROOT, not from backend/, so the model can be copied
# in alongside the application:
#
#   docker build -f backend/Dockerfile -t plately-api .
#
# Inference dependencies are chosen at build time:
#
#   --build-arg INFERENCE=tflite   (default) ~50 MB, tflite-runtime only
#   --build-arg INFERENCE=full                ~600 MB, full TensorFlow
#
# The tflite build needs ml/artifacts/model.tflite, produced by
# `python ml/export_tflite.py`. See app/ml/predictor.py.

FROM python:3.13-slim

ARG INFERENCE=tflite

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

# Pillow needs these at runtime for JPEG and zlib support.
RUN apt-get update \
    && apt-get install -y --no-install-recommends libjpeg62-turbo zlib1g \
    && rm -rf /var/lib/apt/lists/*

COPY backend/requirements.txt backend/requirements-serve.txt backend/requirements-ml.txt ./
RUN pip install -r requirements.txt \
    && if [ "$INFERENCE" = "full" ]; then \
         pip install -r requirements-ml.txt; \
       else \
         pip install -r requirements-serve.txt; \
       fi

COPY backend/app ./app

# The served model, baked in. Hosts that build from git — Railway among them —
# have no way to mount a file that is not in the repository, so the model
# travels with the image. Only these two artifacts are versioned; see
# ../.gitignore. Swapping in a better model means a rebuild.
COPY ml/artifacts/model.tflite ml/artifacts/class_indices.json /models/
ENV TFLITE_MODEL_PATH=/models/model.tflite \
    CLASS_INDEX_PATH=/models/class_indices.json

# Run as an unprivileged user; the media directory has to be writable by it.
# `/app/data` is where a mounted volume is expected to land — see
# docker-entrypoint.sh, which fixes its ownership at startup because hosts
# attach volumes as root no matter what USER the image declares.
RUN useradd --create-home --uid 10001 plately \
    && mkdir -p /app/media /app/data \
    && chown -R plately:plately /app

COPY backend/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# Deliberately no USER: the entrypoint starts as root, chowns the volume, and
# drops to uid 10001 before exec'ing the server. The process that serves
# requests is unprivileged.
ENTRYPOINT ["docker-entrypoint.sh"]

EXPOSE 8000

# Shell form so $PORT expands: Railway and most container hosts assign a port
# at runtime and expect the app to bind it. Falls back to 8000 locally.
#
# Two workers is a sensible floor: one serves requests while the other is busy
# with an inference. Raise WEB_CONCURRENCY if the host has the memory — each
# worker loads its own copy of the model.
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000} --workers ${WEB_CONCURRENCY:-2}"]

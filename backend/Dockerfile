# Backend image. The front end is a static bundle and is deployed separately —
# see deploy/README.md.
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

COPY requirements.txt requirements-serve.txt requirements-ml.txt ./
RUN pip install -r requirements.txt \
    && if [ "$INFERENCE" = "full" ]; then \
         pip install -r requirements-ml.txt; \
       else \
         pip install -r requirements-serve.txt; \
       fi

COPY app ./app

# Run as an unprivileged user; the media directory has to be writable by it.
RUN useradd --create-home --uid 10001 plately \
    && mkdir -p /app/media \
    && chown -R plately:plately /app
USER plately

EXPOSE 8000

# Two workers is a sensible floor: one serves requests while the other is busy
# with an inference. Raise it if the host has the memory for it — each worker
# loads its own copy of the model.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "2"]

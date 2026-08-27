FROM node:22-bookworm-slim AS frontend-builder

WORKDIR /app/web
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web/ ./
RUN npm run build

FROM python:3.12-slim-bookworm AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    HOST=0.0.0.0 \
    PORT=10000 \
    STATIC_ROOT=/app/web/dist/client \
    DATA_ROOT=/tmp/whiteboard/jobs \
    RENDER_WORKERS=1

RUN apt-get update \
    && apt-get install --yes --no-install-recommends ffmpeg fonts-liberation \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt ./
RUN pip install --no-cache-dir --requirement requirements.txt

COPY assets/ ./assets/
COPY scripts/ ./scripts/
COPY web/scripts/local_render_server.py ./web/scripts/local_render_server.py
COPY --from=frontend-builder /app/web/dist/client ./web/dist/client

EXPOSE 10000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD python -c "import os, urllib.request; urllib.request.urlopen('http://127.0.0.1:' + os.environ['PORT'] + '/api/health', timeout=3)"

CMD ["python", "web/scripts/local_render_server.py"]

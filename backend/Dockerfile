FROM python:3.12-slim

WORKDIR /app
ENV PYTHONPATH=/app

RUN apt-get update && apt-get install -y \
    build-essential \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/ .

RUN chmod +x start.sh

EXPOSE 8000
CMD ["/bin/sh", "start.sh"]
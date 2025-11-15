FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

COPY bot/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 9000

ENV PYTHONUNBUFFERED=1

CMD ["bash", "-c", "python3 bot/run_sync_api.py & python3 bot/main.py"]

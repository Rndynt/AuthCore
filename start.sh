#!/bin/bash

echo "Starting backend API on port 5001..."
npm run dev &
BACKEND_PID=$!

echo "Waiting for backend to be ready..."
for i in $(seq 1 30); do
  if curl -sf http://localhost:5001/healthz > /dev/null 2>&1; then
    echo "Backend is ready!"
    break
  fi
  sleep 1
done

echo "Starting admin UI on port 5000..."
cd admin-ui
exec npm run dev -- -p 5000

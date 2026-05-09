#!/bin/bash
set -e
echo "=== Digital Signage Dev ==="

# Backend — через nodemon для автоперезапуска
cd backend
[ ! -d node_modules ] && npm install
npx nodemon --quiet server.js &
BACKEND_PID=$!
cd ..

# Ждём пока backend поднимется
for i in $(seq 1 10); do
  curl -sf http://localhost:3001/api/content >/dev/null 2>&1 && break
  sleep 0.5
done

# Frontend
cd frontend
[ ! -d node_modules ] && npm install
BROWSER=none npm start &
FRONTEND_PID=$!
cd ..

echo ""
echo "  Admin UI  → http://localhost:3000"
echo "  Backend   → http://localhost:3001"
echo "  Player    → http://localhost:3000/player/<screen-id>"
echo ""
echo "Ctrl+C to stop"

cleanup() {
    kill $BACKEND_PID $FRONTEND_PID 2>/dev/null
    exit 0
}
trap cleanup INT TERM
wait

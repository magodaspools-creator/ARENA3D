#!/usr/bin/env bash
# Starts a local static server and opens the prototype in the browser.
cd "$(dirname "$0")"
PORT="${PORT:-8080}"
echo "Arena prototype → http://localhost:$PORT"
( sleep 1; xdg-open "http://localhost:$PORT" >/dev/null 2>&1 || true ) &
python3 -m http.server "$PORT"

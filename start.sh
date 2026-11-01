#!/usr/bin/env bash
# Nabd - runs on this computer with only Node.js 20+ installed.
set -e
cd "$(dirname "$0")"
[ -d server/node_modules ] || (cd server && npm install)
[ -d backoffice/node_modules ] || (cd backoffice && npm install)
[ -f backoffice/dist/index.html ] || (cd backoffice && npm run build)
(sleep 4; command -v xdg-open >/dev/null && xdg-open http://localhost:4000/ || command -v open >/dev/null && open http://localhost:4000/) &
cd server && npm run local

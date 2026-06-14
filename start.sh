#!/bin/bash

set -e

echo "Building admin UI static files..."
cd admin-ui
npm install --legacy-peer-deps --silent
npm run build
cd ..

echo "Copying admin UI to dist/public..."
mkdir -p dist/public
cp -r admin-ui/out/* dist/public/

echo "Starting Realmio API + Admin UI on port 5000..."
exec node_modules/.bin/tsx apps/api/src/main.ts

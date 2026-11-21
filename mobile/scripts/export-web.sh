#!/usr/bin/env bash
# Builds the phone app for the browser and puts it in the web app under /app,
# so anyone can try it at https://<your-site>/app without installing anything.
# Needs the same EXPO_PUBLIC_* values as a phone build (see .env.example).
set -euo pipefail
cd "$(dirname "$0")/.."

: "${EXPO_PUBLIC_SUPABASE_URL:?set EXPO_PUBLIC_SUPABASE_URL}"
: "${EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY:?set EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY}"

rm -rf dist
npx expo export --platform web

# Hosts often skip folders named node_modules, so give bundled assets a plain path.
mv dist/assets/node_modules dist/assets/pkg
find dist/_expo -name '*.js' -exec sed -i.bak 's#/app/assets/node_modules/#/app/assets/pkg/#g' {} +
find dist/_expo -name '*.bak' -delete

rm -rf ../web/public/app
cp -R dist ../web/public/app
echo "Phone preview copied to web/public/app"

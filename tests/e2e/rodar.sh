#!/usr/bin/env bash
# Executado dentro de "firebase emulators:exec" (ver npm run test:e2e).
set -euo pipefail
cd "$(dirname "$0")/../.."
export FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099
npx tsx scripts/criar-propriedade.ts --projeto demo-boicontrol --id fazenda-teste --nome "Fazenda Boa Vista" --email admin@teste.com --senha senha123
VITE_USAR_EMULADORES=true npm run build -w @boicontrol/web >/dev/null
node tests/e2e/fluxo-offline.mjs

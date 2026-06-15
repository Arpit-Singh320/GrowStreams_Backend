#!/usr/bin/env bash
# wsl-deploy.sh
# Run inside WSL: wsl -d Ubuntu -- bash /mnt/c/Users/sarth/Growstreams/GrowStreams_Backend/scripts/wsl-deploy.sh
# Uploads stream_core_eth.opt.wasm to Vara.eth Hoodi via ethexe CLI.
# Writes STREAM_CORE_ETH_CODE_ID back to api/.env.

set -e

ROOT="/mnt/c/Users/sarth/Growstreams/GrowStreams_Backend"
ENV_FILE="$ROOT/api/.env"
WASM="$ROOT/contracts/vara-eth/target/wasm32v1-none/wasm32-gear/release/stream_core_eth.opt.wasm"
STATE="$ROOT/deploy-state.json"

# Parse required vars from .env
get_env() { grep -m1 "^$1=" "$ENV_FILE" | cut -d= -f2- | tr -d '\r\n'; }

ETH_PRIVATE_KEY=$(get_env ETH_PRIVATE_KEY)
ETH_ADDRESS=$(get_env ETH_ADDRESS)
VARA_ETH_RPC=$(get_env VARA_ETH_RPC)
VARA_ETH_ROUTER=$(get_env VARA_ETH_ROUTER)
STREAM_CORE_ETH_ABI=$(get_env STREAM_CORE_ETH_ABI)

echo "=== Vara.eth WASM Upload via ethexe (WSL) ==="
echo "WASM   : $WASM"
echo "RPC    : $VARA_ETH_RPC"
echo "Router : $VARA_ETH_ROUTER"
echo "Sender : $ETH_ADDRESS"
echo ""

if [ ! -f "$WASM" ]; then
  echo "Error: WASM not found at $WASM"; exit 1
fi
if [ -z "$ETH_PRIVATE_KEY" ]; then
  echo "Error: ETH_PRIVATE_KEY not set"; exit 1
fi

# Import key into ethexe keyring (idempotent)
echo "Step 1: Importing key..."
ethexe key keyring import --private-key "$ETH_PRIVATE_KEY" 2>/dev/null || true

# Upload WASM — emits CodeGotValidated event with codeId
echo ""
echo "Step 2: Uploading WASM (EIP-4844 blob tx)..."
UPLOAD_OUT=$(ethexe tx \
  --ethereum-rpc "$VARA_ETH_RPC" \
  --ethereum-router "$VARA_ETH_ROUTER" \
  --sender "$ETH_ADDRESS" \
  upload "$WASM" \
  --watch 2>&1)

echo "$UPLOAD_OUT"

# Extract code_id (0x + 64 hex chars)
CODE_ID=$(echo "$UPLOAD_OUT" | grep -oP '0x[a-fA-F0-9]{64}' | head -1)
if [ -z "$CODE_ID" ]; then
  echo ""
  echo "Error: Could not parse code_id from upload output."
  echo "Set STREAM_CORE_ETH_CODE_ID manually in api/.env then run: node scripts/deploy-js/create-program.mjs"
  exit 1
fi

echo ""
echo "=== Upload complete ==="
echo "Code ID: $CODE_ID"

# Write CODE_ID to .env (replace existing blank line or add)
if grep -q "^STREAM_CORE_ETH_CODE_ID=" "$ENV_FILE"; then
  sed -i "s|^STREAM_CORE_ETH_CODE_ID=.*|STREAM_CORE_ETH_CODE_ID=$CODE_ID|" "$ENV_FILE"
else
  echo "STREAM_CORE_ETH_CODE_ID=$CODE_ID" >> "$ENV_FILE"
fi
echo "Written STREAM_CORE_ETH_CODE_ID to api/.env"

echo ""
echo "Next: node scripts/deploy-js/create-program.mjs"

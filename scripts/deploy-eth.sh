#!/usr/bin/env bash
set -euo pipefail

# GrowStreams V2 — Deploy stream-core-eth WASM to Vara.eth (Hoodi Testnet)
#
# What this script does (Steps 1-4):
#   1. Import ETH private key into ethexe keyring
#   2. Upload stream_core_eth.opt.wasm → get CODE_ID
#   3. Create program with ABI interface (create-with-abi) → get PROGRAM_ID + MIRROR
#   4. Top up executable balance (1 wVARA = 1000000000000 units)
#
# What it does NOT do (handled by JS scripts):
#   - Deploy StreamCoreEthAbi.sol / StreamEscrow.sol  → node scripts/deploy-js/deploy-eth.mjs
#   - Send Initialize message                          → node scripts/deploy-js/init-stream-core-eth.mjs
#
# Prerequisites:
#   1. Fill .env with all VARA_ETH_* vars (see .env.example)
#   2. Fund ETH_ADDRESS on Hoodi: https://holesky-faucet.pk910.de (or ask team)
#   3. Install ethexe: cargo install --git https://github.com/gear-tech/gear --bin ethexe
#   4. Build WASM: cd contracts/vara-eth && cargo build --release --target wasm32v1-none
#   5. Compile Solidity: node scripts/deploy-js/compile-escrow.mjs
#      (Puts StreamCoreEthAbi address into STREAM_CORE_ETH_ABI in .env — needed for create-with-abi)
#
# Resume flags (skip completed steps):
#   SKIP_UPLOAD=1   — reuse STREAM_CORE_ETH_CODE_ID from .env
#   SKIP_CREATE=1   — reuse STREAM_CORE_ETH_PROGRAM_ID + STREAM_CORE_ETH_MIRROR from .env

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Load env
if [ -f "$PROJECT_ROOT/.env" ]; then
  set -a; source "$PROJECT_ROOT/.env"; set +a
elif [ -f "$PROJECT_ROOT/api/.env" ]; then
  set -a; source "$PROJECT_ROOT/api/.env"; set +a
else
  echo "Error: .env not found at $PROJECT_ROOT/.env"; exit 1
fi

# Required vars
: "${ETH_PRIVATE_KEY:?Set ETH_PRIVATE_KEY in .env}"
: "${ETH_ADDRESS:?Set ETH_ADDRESS in .env}"
: "${VARA_ETH_RPC:?Set VARA_ETH_RPC in .env (e.g. https://hoodi-reth-rpc.gear-tech.io)}"
: "${VARA_ETH_ROUTER:?Set VARA_ETH_ROUTER in .env (Hoodi router address)}"
: "${STREAM_CORE_ETH_ABI:?Set STREAM_CORE_ETH_ABI in .env (deploy StreamCoreEthAbi.sol first via compile-escrow.mjs)}"

SKIP_UPLOAD="${SKIP_UPLOAD:-0}"
SKIP_CREATE="${SKIP_CREATE:-0}"
# Executable balance top-up: 1 wVARA = 1000000000000 (12 decimals)
TOPUP_AMOUNT="${VARA_ETH_TOPUP:-1000000000000}"

# Check ethexe binary
if ! command -v ethexe &>/dev/null; then
  echo ""
  echo "Error: ethexe binary not found."
  echo "Install: cargo install --git https://github.com/gear-tech/gear --bin ethexe"
  exit 1
fi

WASM_PATH="$PROJECT_ROOT/contracts/vara-eth/target/wasm32v1-none/wasm32-gear/release/stream_core_eth.opt.wasm"
DEPLOY_STATE="$PROJECT_ROOT/deploy-state.json"
SALT="0x$(openssl rand -hex 32)"

if [ ! -f "$WASM_PATH" ]; then
  echo "Error: WASM artifact not found at:"
  echo "  $WASM_PATH"
  echo "Build first: cd contracts/vara-eth && cargo build --release --target wasm32v1-none"
  exit 1
fi

[ ! -f "$DEPLOY_STATE" ] && echo '{}' > "$DEPLOY_STATE"

echo "=== GrowStreams V2 — Vara.eth Deploy (Hoodi Testnet) ==="
echo "RPC          : $VARA_ETH_RPC"
echo "Router       : $VARA_ETH_ROUTER"
echo "Sender       : $ETH_ADDRESS"
echo "ABI Contract : $STREAM_CORE_ETH_ABI"
echo "WASM         : $WASM_PATH"
echo "Salt         : $SALT"
echo "Top-up       : $TOPUP_AMOUNT (wVARA base units)"
echo ""

# ── Step 1: Import key ──────────────────────────────────────────────────────
echo "Step 1/4: Importing Ethereum key into ethexe keyring..."
ethexe key keyring import --private-key "$ETH_PRIVATE_KEY"
echo "  Key imported."
echo ""

# ── Step 2: Upload WASM code ────────────────────────────────────────────────
if [ "$SKIP_UPLOAD" = "1" ]; then
  : "${STREAM_CORE_ETH_CODE_ID:?SKIP_UPLOAD=1 but STREAM_CORE_ETH_CODE_ID not set in .env}"
  CODE_ID="$STREAM_CORE_ETH_CODE_ID"
  echo "Step 2/4: Skipping upload (SKIP_UPLOAD=1), using CODE_ID=$CODE_ID"
else
  echo "Step 2/4: Uploading WASM code (--watch, may take 1-2 min)..."
  UPLOAD_OUTPUT=$(ethexe tx \
    --ethereum-rpc "$VARA_ETH_RPC" \
    --ethereum-router "$VARA_ETH_ROUTER" \
    --sender "$ETH_ADDRESS" \
    upload "$WASM_PATH" \
    --watch 2>&1)
  echo "$UPLOAD_OUTPUT"

  CODE_ID=$(echo "$UPLOAD_OUTPUT" | grep -oE 'code[_\s-]?id["\s:=]+0x[a-fA-F0-9]+' | grep -oE '0x[a-fA-F0-9]+' | head -1 || echo "")
  # fallback: any 0x hex that is 66 chars (32 bytes)
  if [ -z "$CODE_ID" ]; then
    CODE_ID=$(echo "$UPLOAD_OUTPUT" | grep -oE '0x[a-fA-F0-9]{64}' | head -1 || echo "")
  fi

  if [ -z "$CODE_ID" ]; then
    echo ""
    echo "Error: Could not parse code_id from ethexe output."
    echo "Set STREAM_CORE_ETH_CODE_ID in .env and re-run with SKIP_UPLOAD=1."
    exit 1
  fi
  echo ""
  echo "  Code ID: $CODE_ID"
fi

# ── Step 3: Create program with ABI interface ───────────────────────────────
if [ "$SKIP_CREATE" = "1" ]; then
  : "${STREAM_CORE_ETH_PROGRAM_ID:?SKIP_CREATE=1 but STREAM_CORE_ETH_PROGRAM_ID not set in .env}"
  : "${STREAM_CORE_ETH_MIRROR:?SKIP_CREATE=1 but STREAM_CORE_ETH_MIRROR not set in .env}"
  PROGRAM_ID="$STREAM_CORE_ETH_PROGRAM_ID"
  MIRROR_ADDR="$STREAM_CORE_ETH_MIRROR"
  echo "Step 3/4: Skipping create (SKIP_CREATE=1), using PROGRAM_ID=$PROGRAM_ID MIRROR=$MIRROR_ADDR"
else
  echo ""
  echo "Step 3/4: Creating program with ABI (create-with-abi)..."
  # create-with-abi <code_id> <abi_contract_address> --salt <salt> --watch
  CREATE_OUTPUT=$(ethexe tx \
    --ethereum-rpc "$VARA_ETH_RPC" \
    --ethereum-router "$VARA_ETH_ROUTER" \
    --sender "$ETH_ADDRESS" \
    create-with-abi "$CODE_ID" "$STREAM_CORE_ETH_ABI" \
    --salt "$SALT" \
    --watch 2>&1)
  echo "$CREATE_OUTPUT"

  PROGRAM_ID=$(echo "$CREATE_OUTPUT" | grep -oE 'program[_\s-]?id["\s:=]+0x[a-fA-F0-9]+' | grep -oE '0x[a-fA-F0-9]+' | head -1 || echo "")
  if [ -z "$PROGRAM_ID" ]; then
    PROGRAM_ID=$(echo "$CREATE_OUTPUT" | grep -oE '0x[a-fA-F0-9]{64}' | head -1 || echo "")
  fi

  MIRROR_ADDR=$(echo "$CREATE_OUTPUT" | grep -oiE 'mirror["\s:=]+0x[a-fA-F0-9]{40}' | grep -oE '0x[a-fA-F0-9]{40}' | head -1 || echo "")
  if [ -z "$MIRROR_ADDR" ]; then
    MIRROR_ADDR=$(echo "$CREATE_OUTPUT" | grep -oE '0x[a-fA-F0-9]{40}' | tail -1 || echo "")
  fi

  if [ -z "$PROGRAM_ID" ] || [ -z "$MIRROR_ADDR" ]; then
    echo ""
    echo "Error: Could not parse program_id / mirror from create-with-abi output."
    echo "Set STREAM_CORE_ETH_PROGRAM_ID and STREAM_CORE_ETH_MIRROR in .env, then re-run with SKIP_UPLOAD=1 SKIP_CREATE=1."
    exit 1
  fi
  echo ""
  echo "  Program ID  : $PROGRAM_ID"
  echo "  Mirror Addr : $MIRROR_ADDR"
fi

# ── Step 4: Top up executable balance ───────────────────────────────────────
echo ""
echo "Step 4/4: Topping up executable balance ($TOPUP_AMOUNT wVARA base units)..."
ethexe tx \
  --ethereum-rpc "$VARA_ETH_RPC" \
  --ethereum-router "$VARA_ETH_ROUTER" \
  --sender "$ETH_ADDRESS" \
  executable-balance-top-up "$MIRROR_ADDR" "$TOPUP_AMOUNT" \
  --approve \
  --watch

echo ""
echo "=== WASM deploy complete ==="
echo ""
echo "Add these to .env:"
echo "  STREAM_CORE_ETH_CODE_ID=\"$CODE_ID\""
echo "  STREAM_CORE_ETH_PROGRAM_ID=\"$PROGRAM_ID\""
echo "  STREAM_CORE_ETH_MIRROR=\"$MIRROR_ADDR\""
echo ""

# Save to deploy-state.json
if command -v jq &>/dev/null; then
  TMP=$(mktemp)
  jq \
    --arg codeId "$CODE_ID" \
    --arg programId "$PROGRAM_ID" \
    --arg mirror "$MIRROR_ADDR" \
    --arg abiAddr "$STREAM_CORE_ETH_ABI" \
    --arg time "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    '.["stream-core-eth"] = {
      "codeId": $codeId,
      "programId": $programId,
      "mirror": $mirror,
      "abiContract": $abiAddr,
      "network": "vara-eth-hoodi",
      "deployedAt": $time
    }' "$DEPLOY_STATE" > "$TMP" && mv "$TMP" "$DEPLOY_STATE"
  echo "Saved to $DEPLOY_STATE"
fi

echo ""
echo "Next steps:"
echo "  1. node scripts/deploy-js/init-stream-core-eth.mjs   (send Initialize message)"
echo "  2. node scripts/deploy-js/deploy-eth.mjs             (deploy StreamEscrow.sol)"

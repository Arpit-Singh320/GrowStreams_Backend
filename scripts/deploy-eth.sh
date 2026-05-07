#!/usr/bin/env bash
set -euo pipefail

# GrowStreams V2 — Deploy stream-core-eth to Vara.eth (Hoodi Testnet)
#
# Prerequisites:
#   1. Fill .env: ETH_PRIVATE_KEY, ETH_ADDRESS, ADMIN_ADDRESS, VARA_ETH_* variables
#   2. Fund ETH_ADDRESS at https://eth.vara.network/faucet (need ~0.05 ETH for gas)
#   3. Install ethexe binary: https://get.gear.rs/#vara-eth
#      OR: cargo install --git https://github.com/gear-tech/gear ethexe-cli
#   4. Build the contract first: cd contracts/vara-eth && cargo build --release
#
# After this script:
#   - Set STREAM_CORE_ETH_CODE_ID, STREAM_CORE_ETH_PROGRAM_ID, STREAM_CORE_ETH_MIRROR in .env
#   - Run: node scripts/deploy-js/deploy-eth.mjs   (deploys StreamEscrow.sol)

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Load env
if [ -f "$PROJECT_ROOT/.env" ]; then
  set -a; source "$PROJECT_ROOT/.env"; set +a
else
  echo "Error: .env not found"; exit 1
fi

# Validate required vars
: "${ETH_PRIVATE_KEY:?Set ETH_PRIVATE_KEY in .env (run: node scripts/deploy-js/show-keys.mjs)}"
: "${ETH_ADDRESS:?Set ETH_ADDRESS in .env}"
: "${ADMIN_ADDRESS:?Set ADMIN_ADDRESS in .env (Vara SS58 or 0x hex)}"
: "${VARA_ETH_RPC:?VARA_ETH_RPC missing}"
: "${VARA_ETH_ROUTER:?VARA_ETH_ROUTER missing}"

# Check ethexe binary
if ! command -v ethexe &>/dev/null; then
  echo ""
  echo "Error: ethexe binary not found."
  echo "Install with one of:"
  echo "  curl -L https://get.gear.rs/ethexe-latest-aarch64-apple-darwin.tar.gz | tar xz"
  echo "  cargo install --git https://github.com/gear-tech/gear ethexe-cli"
  exit 1
fi

WASM_PATH="$PROJECT_ROOT/contracts/vara-eth/target/wasm-projects/release/wasm32v1-none/release/stream_core_eth.wasm"
DEPLOY_STATE="$PROJECT_ROOT/deploy-state.json"
SALT="0x$(openssl rand -hex 32)"

if [ ! -f "$WASM_PATH" ]; then
  echo "Error: WASM artifact not found at:"
  echo "  $WASM_PATH"
  echo "Build first: cd contracts/vara-eth && cargo build --release"
  exit 1
fi

[ ! -f "$DEPLOY_STATE" ] && echo '{}' > "$DEPLOY_STATE"

echo "=== GrowStreams V2 — Vara.eth Deploy (Hoodi Testnet) ==="
echo "RPC     : $VARA_ETH_RPC"
echo "Router  : $VARA_ETH_ROUTER"
echo "Sender  : $ETH_ADDRESS"
echo "WASM    : $WASM_PATH"
echo "Salt    : $SALT"
echo ""

# ── Step 1: Import key ──────────────────────────────────────────────────────
echo "Step 1/4: Importing Ethereum key into ethexe keyring..."
ethexe key keyring import --private-key "$ETH_PRIVATE_KEY"
echo "  Key imported."
echo ""

# ── Step 2: Upload WASM code ────────────────────────────────────────────────
echo "Step 2/4: Uploading WASM code (waiting for on-chain approval)..."
UPLOAD_OUTPUT=$(ethexe tx \
  --ethereum-rpc "$VARA_ETH_RPC" \
  --ethereum-router "$VARA_ETH_ROUTER" \
  --sender "$ETH_ADDRESS" \
  upload "$WASM_PATH" \
  --watch 2>&1)

echo "$UPLOAD_OUTPUT"

CODE_ID=$(echo "$UPLOAD_OUTPUT" | grep -oE '"code_id"\s*:\s*"(0x[a-fA-F0-9]+)"' | grep -oE '0x[a-fA-F0-9]+' | head -1 || \
          echo "$UPLOAD_OUTPUT" | grep -oE 'code_id[[:space:]]*[=:][[:space:]]*(0x[a-fA-F0-9]+)' | grep -oE '0x[a-fA-F0-9]+' | head -1 || echo "")

if [ -z "$CODE_ID" ]; then
  echo ""
  echo "Error: Could not parse code_id from ethexe output."
  echo "Set STREAM_CORE_ETH_CODE_ID manually in .env and re-run with SKIP_UPLOAD=1."
  exit 1
fi

echo ""
echo "  Code ID: $CODE_ID"

# ── Step 3: Create program with ABI interface ───────────────────────────────
echo ""
echo "Step 3/4: Creating program with ABI interface..."

# admin_bytes32: pad SS58 or hex address to 32 bytes
# If ADMIN_ADDRESS starts with 0x it's already hex; pad to 32 bytes
if [[ "$ADMIN_ADDRESS" == 0x* ]]; then
  ADMIN_HEX="$ADMIN_ADDRESS"
else
  # SS58 to hex via ethexe (or just use the hex public key from show-keys.mjs)
  ADMIN_HEX="$ADMIN_ADDRESS"
fi

CREATE_OUTPUT=$(ethexe tx \
  --ethereum-rpc "$VARA_ETH_RPC" \
  --ethereum-router "$VARA_ETH_ROUTER" \
  --sender "$ETH_ADDRESS" \
  create-with-abi "$CODE_ID" "$SALT" \
  --watch 2>&1)

echo "$CREATE_OUTPUT"

PROGRAM_ID=$(echo "$CREATE_OUTPUT" | grep -oE '"program_id"\s*:\s*"(0x[a-fA-F0-9]+)"' | grep -oE '0x[a-fA-F0-9]+' | head -1 || echo "")
MIRROR_ADDR=$(echo "$CREATE_OUTPUT" | grep -oE '"mirror"\s*:\s*"(0x[a-fA-F0-9]{40})"' | grep -oE '0x[a-fA-F0-9]{40}' | head -1 || \
              echo "$CREATE_OUTPUT" | grep -oiE 'mirror[[:space:]]*[=:][[:space:]]*(0x[a-fA-F0-9]{40})' | grep -oE '0x[a-fA-F0-9]{40}' | head -1 || echo "")

if [ -z "$PROGRAM_ID" ] || [ -z "$MIRROR_ADDR" ]; then
  echo ""
  echo "Warning: Could not auto-parse program_id / mirror from output."
  echo "Set them manually in .env and then run the init step below:"
  echo ""
  echo "  ethexe tx --ethereum-rpc \$VARA_ETH_RPC --ethereum-router \$VARA_ETH_ROUTER \\"
  echo "    --sender \$ETH_ADDRESS \\"
  echo "    send \$STREAM_CORE_ETH_MIRROR \\"
  echo "    '{\"initialize\": {\"admin\": \"<ADMIN_HEX32>\", \"min_buffer_seconds\": $MIN_BUFFER_SECONDS}}'"
  exit 1
fi

echo ""
echo "  Program ID  : $PROGRAM_ID"
echo "  Mirror Addr : $MIRROR_ADDR"

# ── Step 4: Fund executable balance + initialize ────────────────────────────
echo ""
echo "Step 4/4: Topping up executable balance and initializing..."

# Top up 0.1 wTVARA (100000000000 units, 12 decimals) so the program can execute
ethexe tx \
  --ethereum-rpc "$VARA_ETH_RPC" \
  --ethereum-router "$VARA_ETH_ROUTER" \
  --sender "$ETH_ADDRESS" \
  fund "$MIRROR_ADDR" 100000000000

# Build admin bytes32 (pad ETH address to 32 bytes, or use Vara hex pubkey)
ADMIN_BYTES32=$(node --input-type=module <<EOF
const addr = '${ETH_ADDRESS}';
const hex = addr.startsWith('0x') ? addr.slice(2) : addr;
const padded = hex.padStart(64, '0');
process.stdout.write('0x' + padded);
EOF
)

# Initialize the program: set admin and min_buffer_seconds
ethexe tx \
  --ethereum-rpc "$VARA_ETH_RPC" \
  --ethereum-router "$VARA_ETH_ROUTER" \
  --sender "$ETH_ADDRESS" \
  send "$MIRROR_ADDR" \
  "{\"initialize\": {\"admin\": \"$ADMIN_BYTES32\", \"min_buffer_seconds\": $MIN_BUFFER_SECONDS}}" \
  --watch

echo ""
echo "=== Deployment complete ==="
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
    --arg time "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    '.["stream-core-eth"] = {
      "codeId": $codeId,
      "programId": $programId,
      "mirror": $mirror,
      "network": "vara-eth-hoodi",
      "deployedAt": $time
    }' "$DEPLOY_STATE" > "$TMP" && mv "$TMP" "$DEPLOY_STATE"
  echo "Saved to $DEPLOY_STATE"
fi

echo ""
echo "Next: node scripts/deploy-js/deploy-eth.mjs   (deploys StreamEscrow.sol)"

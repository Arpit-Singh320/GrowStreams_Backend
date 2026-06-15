import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
const __dirname = dirname(fileURLToPath(import.meta.url));

const env = {};
readFileSync(resolve(__dirname, '../api/.env'), 'utf8')
  .split(/\r?\n/)
  .forEach(l => { const m = l.match(/^([A-Z_][A-Z0-9_]*)=(.*)/); if (m) env[m[1]] = m[2].trim(); });

const PK   = env.ETH_PRIVATE_KEY;
const ADDR = env.ETH_ADDRESS;
const RPC  = 'https://hoodi-reth-rpc.gear-tech.io';
const ROUTER = env.VARA_ETH_ROUTER;
const WASM = '/mnt/c/Users/sarth/Growstreams/GrowStreams_Backend/contracts/vara-eth/target/wasm32v1-none/wasm32-gear/release/stream_core_eth.opt.wasm';
const ENV_FILE = '/mnt/c/Users/sarth/Growstreams/GrowStreams_Backend/api/.env';

const sh = `#!/bin/bash
KEYDIR=/tmp/ekd
echo "=== Step 1: Import key ==="
ethexe key keyring import --private-key ${PK} --name deployer --path $KEYDIR 2>&1 || true
echo "=== Step 2: Upload WASM (blob tx) ==="
UPLOAD_OUT=$(ethexe tx \\
  --key-store $KEYDIR \\
  --ethereum-rpc ${RPC} \\
  --ethereum-router ${ROUTER} \\
  --sender ${ADDR} \\
  upload ${WASM} \\
  --watch 2>&1)
echo "$UPLOAD_OUT"
CODE_ID=$(echo "$UPLOAD_OUT" | grep -oP '0x[a-fA-F0-9]{64}' | head -1)
if [ -z "$CODE_ID" ]; then echo "ERROR: could not parse code_id"; exit 1; fi
echo "=== Code ID: $CODE_ID ==="
if grep -q "^STREAM_CORE_ETH_CODE_ID=" ${ENV_FILE}; then
  sed -i "s|^STREAM_CORE_ETH_CODE_ID=.*|STREAM_CORE_ETH_CODE_ID=$CODE_ID|" ${ENV_FILE}
else
  echo "STREAM_CORE_ETH_CODE_ID=$CODE_ID" >> ${ENV_FILE}
fi
echo "Written STREAM_CORE_ETH_CODE_ID to api/.env"
echo "Next: node scripts/deploy-js/create-program.mjs"
`;

const out = resolve(__dirname, 'upload-wsl.sh');
writeFileSync(out, sh, { encoding: 'utf8' });
console.log('Written scripts/upload-wsl.sh');

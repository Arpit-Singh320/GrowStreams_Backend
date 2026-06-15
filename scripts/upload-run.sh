#!/usr/bin/env bash
set -e
KEYDIR=/tmp/ethexe-keys
WASM='/mnt/c/Users/sarth/Growstreams/GrowStreams_Backend/contracts/vara-eth/target/wasm32v1-none/wasm32-gear/release/stream_core_eth.opt.wasm'
ENV_FILE='/mnt/c/Users/sarth/Growstreams/GrowStreams_Backend/api/.env'
echo '=== Importing key ==='
ethexe key keyring import --private-key 0x1164198c128c3377d34deca0bf88efc7921e5ad42ba8a8909ea090fb2165bc12 --name deployer --path $KEYDIR
echo '=== Uploading WASM (blob tx, ~30-120s) ==='
UPLOAD_OUT=$(ethexe tx --key-store $KEYDIR --ethereum-rpc https://hoodi-reth-rpc.gear-tech.io --ethereum-router 0xE549b0AfEdA978271FF7E712232B9F7f39A0b060 --sender 0x20344A08608da16f46275c291E1e54339485fE8C upload $WASM --watch 2>&1)
echo "$UPLOAD_OUT"
CODE_ID=$(echo "$UPLOAD_OUT" | grep -oP '0x[a-fA-F0-9]{64}' | head -1)
if [ -z "$CODE_ID" ]; then echo 'ERROR: could not parse code_id'; exit 1; fi
echo "Code ID: $CODE_ID"
if grep -q '^STREAM_CORE_ETH_CODE_ID=' $ENV_FILE; then sed -i "s|^STREAM_CORE_ETH_CODE_ID=.*|STREAM_CORE_ETH_CODE_ID=$CODE_ID|" $ENV_FILE; else echo "STREAM_CORE_ETH_CODE_ID=$CODE_ID" >> $ENV_FILE; fi
echo 'Written STREAM_CORE_ETH_CODE_ID to .env'
echo 'Next: node scripts/deploy-js/create-program.mjs'

#!/bin/bash
KEYDIR=/tmp/ekd
WASM=/mnt/c/Users/sarth/Growstreams/GrowStreams_Backend/contracts/vara-eth/target/wasm32v1-none/wasm32-gear/release/stream_core_eth.opt.wasm
ethexe key keyring import --private-key 0x1164198c128c3377d34deca0bf88efc7921e5ad42ba8a8909ea090fb2165bc12 --name deployer --path 
ls \/secp/
ethexe tx --key-store \ --ethereum-rpc https://hoodi-reth-rpc.gear-tech.io --ethereum-router 0xE549b0AfEdA978271FF7E712232B9F7f39A0b060 --sender 0x20344A08608da16f46275c291E1e54339485fE8C upload \/mnt/c/Users/sarth/Growstreams/GrowStreams_Backend/contracts/vara-eth/target/wasm32v1-none/wasm32-gear/release/stream_core_eth.opt.wasm --watch

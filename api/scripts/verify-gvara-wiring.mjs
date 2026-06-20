// Verify gVARA streaming wiring after stream-core + gVARA redeploy.
// Checks: (1) stream-core maps wVARA -> current gVARA program,
//         (2) gVARA reports native-wrapper mode and a registered flow controller.
// Run from api/ directory: node scripts/verify-gvara-wiring.mjs

import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '..', '.env') });

const { connect, query } = await import('../src/sails-client.mjs');

const WVARA = process.env.WVARA_TOKEN_ID;
const GVARA = process.env.GVARA_TOKEN_ID;
const STREAM_CORE = process.env.STREAM_CORE_ID;

console.log('=== gVARA Streaming Wiring Check ===');
console.log(`stream-core: ${STREAM_CORE}`);
console.log(`wVARA:       ${WVARA}`);
console.log(`gVARA:       ${GVARA}\n`);

await connect();

let ok = true;

// 1. stream-core.GetSuperToken(wVARA) should return the current gVARA program
try {
  const mapped = await query('streamCore', 'GetSuperToken', WVARA);
  const mappedHex = mapped == null ? null : String(mapped).toLowerCase();
  const expected = GVARA.toLowerCase();
  console.log(`1. stream-core GetSuperToken(wVARA) -> ${mappedHex ?? '(none)'}`);
  if (mappedHex === expected) {
    console.log('   ✓ wVARA correctly mapped to current gVARA\n');
  } else {
    ok = false;
    console.log(`   ✗ MISMATCH — expected ${expected}`);
    console.log('   Fix: run `node scripts/wire-gvara.mjs` (RegisterSuperToken)\n');
  }
} catch (e) {
  ok = false;
  console.log(`1. GetSuperToken failed: ${e.message}\n`);
}

// 2. gVARA meta — native wrapper + flow controller registered
try {
  const meta = await query('gvaraToken', 'GetMeta');
  const isNative = meta?.is_native_wrapper;
  const fcCount = Number(meta?.flow_controller_count ?? 0);
  console.log(`2. gVARA meta: is_native_wrapper=${isNative}, flow_controller_count=${fcCount}`);
  if (isNative !== true) { ok = false; console.log('   ✗ gVARA is NOT a native wrapper — WrapNative will revert'); }
  if (fcCount < 1) {
    ok = false;
    console.log('   ✗ No flow controller registered — stream-core cannot drive gVARA flows');
    console.log('   Fix: run `node scripts/wire-gvara.mjs` (AddFlowController)');
  }
  if (isNative === true && fcCount >= 1) console.log('   ✓ native wrapper with flow controller\n');
  else console.log();
} catch (e) {
  ok = false;
  console.log(`2. GetMeta failed: ${e.message}\n`);
}

console.log(ok ? '✓ Wiring OK — gVARA streaming should work' : '✗ Wiring incomplete — see fixes above');
process.exit(ok ? 0 : 1);

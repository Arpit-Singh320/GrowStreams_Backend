import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const codes = readFileSync(join(__dirname, 'growstreams-codes.txt'), 'utf8')
  .split('\n').map(c => c.trim()).filter(Boolean);

const values = codes.map(c => `('${c}', 'SYSTEM', 1)`).join(',\n');
const sql = `INSERT INTO quest_invites (code, created_by, max_uses) VALUES\n${values}\nON CONFLICT (code) DO NOTHING;`;

writeFileSync(join(__dirname, 'growstreams-codes-insert.sql'), sql);
console.log(`Written ${codes.length} codes to growstreams-codes-insert.sql`);

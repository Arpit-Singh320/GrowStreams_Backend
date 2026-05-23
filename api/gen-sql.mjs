import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const codes = JSON.parse(readFileSync(join(__dirname, 'ginie-codes.json'), 'utf8'));

const values = codes.map(c => `('${c}')`).join(',\n');
const sql = `INSERT INTO ginie_invite_codes (code) VALUES\n${values}\nON CONFLICT (code) DO NOTHING;`;

writeFileSync(join(__dirname, 'ginie-codes-insert.sql'), sql);
console.log(`Written ${codes.length} codes to api/ginie-codes-insert.sql`);

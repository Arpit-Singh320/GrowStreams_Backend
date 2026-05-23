import { writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const codes = [];
for (let i = 0; i < 100; i++) {
  const part1 = Array(4).fill(0).map(() => chars[Math.floor(Math.random() * chars.length)]).join('');
  const part2 = Array(4).fill(0).map(() => chars[Math.floor(Math.random() * chars.length)]).join('');
  codes.push(`GS-${part1}-${part2}`);
}

// Text file
writeFileSync(join(__dirname, 'growstreams-codes.txt'), codes.join('\n'));
console.log('Written 100 codes to growstreams-codes.txt');

// SQL INSERT
const values = codes.map(c => `('${c}')`).join(',\n');
const sql = `INSERT INTO ginie_invite_codes (code) VALUES\n${values}\nON CONFLICT (code) DO NOTHING;`;
writeFileSync(join(__dirname, 'growstreams-codes-insert.sql'), sql);
console.log('Written SQL to growstreams-codes-insert.sql');

console.log('\nFirst 5 codes:');
codes.slice(0, 5).forEach(c => console.log(c));

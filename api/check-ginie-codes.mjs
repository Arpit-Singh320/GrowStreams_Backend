import pg from 'pg';

const pool = new pg.Pool({
  connectionString: 'postgresql://postgres:JJkrrCeNxQssiXnkbnfGnCGPQMtyZaoY@caboose.proxy.rlwy.net:58044/railway',
  ssl: { rejectUnauthorized: false },
});

const client = await pool.connect();

const { rows } = await client.query(`
  SELECT
    COUNT(*) FILTER (WHERE claimed_by IS NULL)      AS unclaimed,
    COUNT(*) FILTER (WHERE claimed_by IS NOT NULL)  AS claimed,
    COUNT(*)                                         AS total
  FROM ginie_invite_codes
`);

const { unclaimed, claimed, total } = rows[0];
console.log(`Total codes:    ${total}`);
console.log(`Claimed:        ${claimed}`);
console.log(`Unclaimed left: ${unclaimed}`);

client.release();
await pool.end();
process.exit(0);

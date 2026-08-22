import postgres from 'postgres';

async function main() {
  const sql = postgres('postgres://chorus:chorus@127.0.0.1:15432/chorus');
  const rows = await sql`
    SELECT DISTINCT c.artist_name, c.deezer_artist_id, COUNT(r.id)::int as results
    FROM artist_challenges c
    LEFT JOIN artist_session_results r ON r.challenge_id = c.id
    WHERE c.source_type = 'artist'
    GROUP BY c.artist_name, c.deezer_artist_id
    ORDER BY results DESC
  `;
  console.table(rows);
  await sql.end();
}
main();

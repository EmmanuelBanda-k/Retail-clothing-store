import pg from 'pg';

const { Pool } = pg;

export function createDatabase(connectionString) {
  const pool = new Pool({ connectionString, max: 10 });
  return {
    query: (text, values) => pool.query(text, values),
    close: () => pool.end(),
    async transaction(work) {
      const client = await pool.connect();
      try {
        await client.query('begin');
        const result = await work(client);
        await client.query('commit');
        return result;
      } catch (error) {
        await client.query('rollback');
        throw error;
      } finally {
        client.release();
      }
    }
  };
}

import pg from 'pg';

const { Pool } = pg;

export function createDatabase(connectionString) {
  const pool = new Pool({ connectionString, max: 10 });
  async function inTransaction(work) {
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

  return {
    query: (text, values) => pool.query(text, values),
    close: () => pool.end(),
    transaction: inTransaction,
    userQuery(session, text, values) {
      return inTransaction(async client => {
        await client.query('set local role pos_app');
        await client.query(`select
          set_config('app.user_id', $1, true),
          set_config('app.store_id', $2, true),
          set_config('app.user_role', $3, true)
        `, [session.userId, session.storeId, session.role]);
        return client.query(text, values);
      });
    }
  };
}

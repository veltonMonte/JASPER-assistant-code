import test from 'node:test';
import assert from 'node:assert/strict';
import sqlite3 from 'sqlite3';
import { CREATE_TABLES_SQL } from '../src/database/schema.js';

test('configurações internas ficam separadas das memórias do usuário', async () => {
  const db = new sqlite3.Database(':memory:');
  const exec = (sql: string) => new Promise<void>((resolve, reject) => db.exec(sql, error => error ? reject(error) : resolve()));
  const all = (sql: string) => new Promise<any[]>((resolve, reject) => db.all(sql, (error, rows) => error ? reject(error) : resolve(rows)));
  try {
    await exec(CREATE_TABLES_SQL);
    await exec(`INSERT INTO memory(key,value,category) VALUES ('jasper.proactive.runtime','{}','jasper-settings'), ('time_preferido','Fortaleza','general')`);
    await exec(CREATE_TABLES_SQL);
    assert.deepEqual((await all('SELECT key FROM memory')).map(row => row.key), ['time_preferido']);
    assert.deepEqual((await all('SELECT key FROM assistant_settings')).map(row => row.key), ['jasper.proactive.runtime']);
    await exec(CREATE_TABLES_SQL);
    assert.equal((await all('SELECT * FROM assistant_settings')).length, 1);
  } finally { await new Promise<void>(resolve => db.close(() => resolve())); }
});

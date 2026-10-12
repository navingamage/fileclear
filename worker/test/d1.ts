import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCHEMA = join(dirname(fileURLToPath(import.meta.url)), '..', 'schema.sql');

/**
 * The real schema in Node's SQLite, behind the part of D1's interface the
 * Worker uses: prepare, bind, first, all, run and batch. The SQL that runs here
 * is the SQL production runs.
 */
export function realDb(): { d1: D1Database; raw: DatabaseSync } {
  const raw = new DatabaseSync(':memory:');
  raw.exec('PRAGMA foreign_keys = ON;');
  raw.exec(readFileSync(SCHEMA, 'utf8'));
  const stmt = (sql: string, args: unknown[] = []) => ({
    bind: (...a: unknown[]) => stmt(sql, a),
    first: async () => (raw.prepare(sql).get(...(args as never[])) as object | undefined) ?? null,
    all: async () => ({ results: raw.prepare(sql).all(...(args as never[])) }),
    run: async () => {
      const r = raw.prepare(sql).run(...(args as never[]));
      return { meta: { changes: Number(r.changes) } };
    },
    _run: () => raw.prepare(sql).run(...(args as never[])),
  });
  const d1 = {
    prepare: (sql: string) => stmt(sql),
    batch: async (stmts: Array<{ _run: () => unknown }>) => stmts.map((s) => { s._run(); return { meta: {} }; }),
  };
  return { d1: d1 as unknown as D1Database, raw };
}

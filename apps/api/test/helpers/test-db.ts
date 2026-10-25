import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { readdirSync, readFileSync } from 'node:fs';
import { createServer } from 'node:net';
import path from 'node:path';

export interface TestDb {
  url: string;
  stop: () => Promise<void>;
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as { port: number };
      server.close(() => resolve(port));
    });
  });
}

/**
 * PostgreSQL embebido (PGlite) expuesto por socket, con las migraciones reales aplicadas.
 * Permite probar la API completa sin Docker ni un servidor externo.
 */
export async function startTestDb(): Promise<TestDb> {
  const db = await PGlite.create();

  const migrationsDir = path.resolve(__dirname, '../../prisma/migrations');
  const migrations = readdirSync(migrationsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  for (const name of migrations) {
    await db.exec(readFileSync(path.join(migrationsDir, name, 'migration.sql'), 'utf8'));
  }

  const port = await freePort();
  const server = new PGLiteSocketServer({ db, port, host: '127.0.0.1' });
  await server.start();

  return {
    url: `postgresql://postgres:postgres@127.0.0.1:${port}/postgres?sslmode=disable`,
    stop: async () => {
      await server.stop();
      await db.close();
    },
  };
}

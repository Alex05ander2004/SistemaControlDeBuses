import path from 'node:path';
import { config } from 'dotenv';
import { defineConfig } from 'prisma/config';

// El .env vive en la raíz del monorepo.
config({ path: path.resolve(__dirname, '../../.env') });

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    // El fallback permite `prisma generate` en CI sin base de datos; migrate/seed fallarán con un error de conexión claro.
    url: process.env.DATABASE_URL ?? 'postgresql://invalid:invalid@localhost:5432/invalid',
  },
});

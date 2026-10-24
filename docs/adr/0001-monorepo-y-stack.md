# ADR 0001 - Monorepo y stack

**Estado:** aceptada

## Contexto

El sistema legado mezclaba frontend y backend en un solo `package.json`, sin tipos ni tests.

## Decisión

Monorepo con npm workspaces: `apps/api` (NestJS), `apps/web` (React + Vite + TypeScript) y `packages/shared` (tipos y esquemas Zod compartidos). Node 22.

## Consecuencias

- Un solo repo y un CI para todo; contratos de datos compartidos.
- Se descarta Create React App (descontinuado).

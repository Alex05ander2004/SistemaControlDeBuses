# AIROVA - Sistema de Control de Buses

Reescritura de un proyecto académico (repo legado: `FranksVilca/Sistema_Control_Buses`). Gestiona usuarios, buses, rutas, horarios, turnos y asistencia, con roles ADMIN, WORKER y DRIVER.

## Reglas de trabajo

- **Git y GitHub los ejecuta SIEMPRE el usuario** (commit, push, ramas, PR, merge). Claude edita archivos y, en cada hito, sugiere el mensaje de commit y los archivos afectados, sin ejecutar nada de git.
- Idioma: documentación y mensajes de UI en español; código, identificadores y commits en inglés (Conventional Commits).
- No guardar secretos en el repo. Usar `.env` (ignorado) y mantener `.env.example`.
- Cada módulo se entrega como vertical completo: esquema + API + UI + tests.

## Stack

- Web: React + Vite + TypeScript, TanStack Query, React Router, React Hook Form + Zod, Tailwind + shadcn/ui
- API: NestJS + TypeScript, Prisma, PostgreSQL 16
- Auth: JWT de acceso + refresh en cookie httpOnly, RBAC con guards
- Calidad: ESLint, Prettier, Vitest/Jest, Playwright, GitHub Actions

## Estructura

- `apps/api`, `apps/web`, `packages/shared`, `docs/`
- Decisiones: `docs/adr/`. Modelo de datos: `docs/data-model.md`. Plan: `docs/roadmap.md`.

## Delegación en subagentes (guía)

| Tarea                                               | Modelo | Esfuerzo |
| --------------------------------------------------- | ------ | -------- |
| Decisiones de arquitectura, diseño de esquema, auth | Opus   | alto     |
| Implementación de módulos CRUD                      | Sonnet | medio    |
| Revisión de código / seguridad                      | Opus   | alto     |
| Búsquedas en el código legado, tareas mecánicas     | Haiku  | bajo     |

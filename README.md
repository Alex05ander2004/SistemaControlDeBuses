<<<<<<< HEAD
# SistemaControlDeBuses
=======
# AIROVA - Sistema de Control de Buses

Plataforma web para administrar buses, rutas, horarios y turnos, y registrar la asistencia de los trabajadores transportados. Reescritura completa de un proyecto académico, con arquitectura por capas, base de datos versionada y seguridad real.

> Estado: **Fase 0 (fundamentos)**. Aún no hay código de aplicación.

## Roles

| Rol    | Puede                                                             |
| ------ | ----------------------------------------------------------------- |
| ADMIN  | Gestionar usuarios, buses, rutas, horarios y turnos; ver reportes |
| DRIVER | Ver sus turnos y marcar la asistencia de los pasajeros            |
| WORKER | Ver su perfil, sus turnos y rutas                                 |

## Stack

React + Vite + TypeScript · NestJS · Prisma · PostgreSQL 16 · JWT · Docker Compose · GitHub Actions

## Requisitos

- Node.js 22 (ver `.nvmrc`)
- Docker Desktop (para PostgreSQL local)

## Puesta en marcha (disponible desde la Fase 2)

```sh
cp .env.example .env      # completar secretos
docker compose up -d db   # levanta PostgreSQL
npm install
npm run dev:api
npm run dev:web
```

## Documentación

- [Roadmap](docs/roadmap.md)
- [Requisitos](docs/requirements.md)
- [Modelo de datos](docs/data-model.md)
- [Decisiones de arquitectura (ADR)](docs/adr/)
- [Prompt de diseño para Stitch](docs/design/stitch-prompt.md)

## Autores

Proyecto original: Añazco Huamanquispe, Andre · Vilca Quispe, Frank's Javier · Huisa Perez, Willy Alexander · Huichi Santander, Gersson A. · Jaita Chura, José Manuel.
>>>>>>> f0bf2dc (chore: bootstrap monorepo, docs and CI)

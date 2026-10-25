<<<<<<< HEAD

# SistemaControlDeBuses

=======

# AIROVA - Sistema de Control de Buses

Plataforma web para administrar buses, rutas, horarios y turnos, y registrar la asistencia de los trabajadores transportados. Reescritura completa de un proyecto académico, con arquitectura por capas, base de datos versionada y seguridad real.

> Estado: **Fase 2 completada** (frontend base, API con autenticación y roles). Los módulos de negocio llegan en la Fase 3.

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

## Puesta en marcha

1. Copia la configuración y completa los secretos:

   ```sh
   cp .env.example .env
   ```

   Genera `JWT_ACCESS_SECRET` con `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` y define `SEED_ADMIN_PASSWORD` (mínimo 12 caracteres).

2. Levanta PostgreSQL, con Docker (`docker compose up -d db`, expuesto en el puerto **5433** para no chocar con un PostgreSQL local en el 5432) o con un PostgreSQL propio. En ese caso crea la base y el usuario y ajusta `DATABASE_URL`:

   ```sql
   CREATE USER airova WITH PASSWORD 'tu_clave';
   CREATE DATABASE airova OWNER airova;
   ```

3. Instala, migra y carga el usuario administrador:

   ```sh
   npm install
   npm run db:deploy --workspace @airova/api
   npm run db:seed --workspace @airova/api
   ```

4. Arranca la API y la web, cada una en su terminal:

   ```sh
   npm run dev:api   # http://localhost:3001
   npm run dev:web   # http://localhost:5173
   ```

Inicia sesión con el usuario `admin` (o `SEED_ADMIN_USERNAME`) y la contraseña de `SEED_ADMIN_PASSWORD`. Con `SEED_SAMPLE_DATA=true` el seed crea además un conductor y un colaborador (`conductor` y `colaborador`, misma contraseña), buses, una ruta, un horario y un turno de ejemplo.

## Pruebas

```sh
npm test
```

Los tests de la API usan PostgreSQL embebido (PGlite) con las migraciones reales: no necesitan Docker ni una base de datos externa.

## Documentación

- [Roadmap](docs/roadmap.md)
- [Requisitos](docs/requirements.md)
- [Modelo de datos](docs/data-model.md)
- [Decisiones de arquitectura (ADR)](docs/adr/)
- [Prompt de diseño para Stitch](docs/design/stitch-prompt.md)

## Autores

Proyecto original: Añazco Huamanquispe, Andre · Vilca Quispe, Frank's Javier · Huisa Perez, Willy Alexander · Huichi Santander, Gersson A. · Jaita Chura, José Manuel.

> > > > > > > f0bf2dc (chore: bootstrap monorepo, docs and CI)

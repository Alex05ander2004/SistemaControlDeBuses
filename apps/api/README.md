# @airova/api

API REST de AIROVA: NestJS 11 + Prisma 7 + PostgreSQL 16.

## Endpoints actuales

| Método | Ruta            | Acceso      | Descripción                                                             |
| ------ | --------------- | ----------- | ----------------------------------------------------------------------- |
| GET    | `/health`       | público     | Estado de la API y de la base de datos                                  |
| POST   | `/auth/login`   | público     | Usuario/correo + contraseña. Límite: 5 por minuto                       |
| POST   | `/auth/refresh` | cookie      | Rota el refresh token y emite un access token nuevo                     |
| POST   | `/auth/logout`  | cookie      | Revoca el refresh token                                                 |
| GET    | `/auth/me`      | autenticado | Usuario de la sesión                                                    |
| GET    | `/users`        | ADMIN       | Lista paginada. Filtros: `search`, `role`, `status`, `page`, `pageSize` |
| GET    | `/users/:id`    | ADMIN       | Ficha completa de un usuario                                            |
| POST   | `/users`        | ADMIN       | Crea un usuario (la contraseña se guarda con argon2id)                  |
| PATCH  | `/users/:id`    | ADMIN       | Edita datos, rol, estado o restablece la contraseña                     |

Todo lo no marcado `@Public()` exige `Authorization: Bearer <accessToken>`. `@Roles()` restringe por rol. Ver ADR 0003.

## Comandos

```sh
npm run start:dev --workspace @airova/api   # desarrollo (regenera el cliente Prisma)
npm run db:migrate --workspace @airova/api  # crea una migración nueva tras cambiar schema.prisma
npm run db:deploy --workspace @airova/api   # aplica migraciones existentes
npm run db:seed --workspace @airova/api     # administrador inicial (y datos de ejemplo opcionales)
npm test --workspace @airova/api
```

## Notas

- El cliente de Prisma se genera en `src/generated/` (ignorado por git); `build`, `start:dev` y `test` lo regeneran.
- `prisma.config.ts` carga el `.env` de la raíz del monorepo.
- La migración inicial se generó con `prisma migrate diff`; cada cambio de esquema debe añadir una migración nueva, nunca editar una ya aplicada.

## Reglas de Usuarios

- No hay borrado: se desactiva con `status: INACTIVE`, lo que cierra sus sesiones y bloquea el acceso.
- Edad entre 18 y 60 años (regla heredada del sistema anterior). Usuario y correo se guardan en minúsculas y son únicos, igual que el DNI (409 si se repiten).
- Un administrador no puede desactivarse ni quitarse el rol a sí mismo, y siempre debe quedar al menos un administrador activo.
- Cambiar la contraseña o desactivar a un usuario revoca sus refresh tokens.
- Crear y editar deja un registro en `audit_logs` (solo nombres de campos, nunca contraseñas).
- Pendiente: foto de perfil (`photoUrl` existe en el modelo, falta el almacenamiento de archivos).

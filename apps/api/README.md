# @airova/api

API REST de AIROVA: NestJS 11 + Prisma 7 + PostgreSQL 16.

## Endpoints actuales

| Método | Ruta             | Acceso      | Descripción                                                                                     |
| ------ | ---------------- | ----------- | ----------------------------------------------------------------------------------------------- |
| GET    | `/health`        | público     | Estado de la API y de la base de datos                                                          |
| POST   | `/auth/login`    | público     | Usuario/correo + contraseña. Límite: 5 por minuto                                               |
| POST   | `/auth/refresh`  | cookie      | Rota el refresh token y emite un access token nuevo                                             |
| POST   | `/auth/logout`   | cookie      | Revoca el refresh token                                                                         |
| GET    | `/auth/me`       | autenticado | Usuario de la sesión                                                                            |
| GET    | `/users`         | ADMIN       | Lista paginada. Filtros: `search`, `role`, `status`, `page`, `pageSize`                         |
| GET    | `/users/:id`     | ADMIN       | Ficha completa de un usuario                                                                    |
| POST   | `/users`         | ADMIN       | Crea un usuario (la contraseña se guarda con argon2id)                                          |
| PATCH  | `/users/:id`     | ADMIN       | Edita datos, rol, estado o restablece la contraseña                                             |
| GET    | `/buses`         | ADMIN       | Lista paginada. Filtros: `search` (placa, marca, modelo), `status`, `page`, `pageSize`          |
| GET    | `/buses/:id`     | ADMIN       | Ficha de un bus                                                                                 |
| POST   | `/buses`         | ADMIN       | Crea un bus (placa en mayúsculas, única)                                                        |
| PATCH  | `/buses/:id`     | ADMIN       | Edita datos o estado (`ACTIVE`, `MAINTENANCE`, `RETIRED` = baja)                                |
| GET    | `/routes`        | ADMIN       | Lista paginada. Filtros: `search` (origen o destino), `active` (true/false), `page`, `pageSize` |
| GET    | `/routes/:id`    | ADMIN       | Ficha de una ruta                                                                               |
| POST   | `/routes`        | ADMIN       | Crea una ruta (activa por defecto)                                                              |
| PATCH  | `/routes/:id`    | ADMIN       | Edita origen, destino o estado (se desactiva con `active: false`)                               |
| GET    | `/schedules`     | ADMIN       | Lista paginada, fecha desc. Filtros: `from`, `to` (AAAA-MM-DD), `page`, `pageSize`              |
| GET    | `/schedules/:id` | ADMIN       | Un horario                                                                                      |
| POST   | `/schedules`     | ADMIN       | Crea un horario (`date`, `departureTime`, `arrivalTime`)                                        |
| PATCH  | `/schedules/:id` | ADMIN       | Edita campos sueltos; valida contra el valor actual del otro                                    |
| DELETE | `/schedules/:id` | ADMIN       | Elimina (204); 409 si algún turno lo usa                                                        |

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

## Reglas de Buses, Rutas y Horarios

- **Buses:** la placa se guarda en mayúsculas (`[A-Z0-9-]`, 5 a 10) y es única sin distinguir mayúsculas; asientos entre 10 y 80. No hay borrado: `RETIRED` es la baja.
- **Rutas:** origen y destino distintos (sin distinguir mayúsculas), con espacios normalizados; la pareja es única y el sentido contrario cuenta como otra ruta. Se desactivan con `active: false`.
- **Horarios:** la llegada debe ser posterior a la salida el mismo día (los viajes que cruzan la medianoche quedan fuera de alcance por ahora). La combinación fecha + salida + llegada es única. Se pueden borrar salvo que un turno los use.
- Todo queda en `audit_logs` (`BUS_*`, `ROUTE_*`, `SCHEDULE_*`).

## Deuda conocida

- La unicidad de rutas y horarios, y la de placas sin distinguir mayúsculas, se valida en el servicio, no en la base: dos peticiones idénticas simultáneas podrían colarse. Cerrarlo requiere una migración con índices únicos (en rutas, sobre `lower(origin), lower(destination)`).
- Al crear Turnos hay que validar que no se baje la cantidad de asientos de un bus por debajo de los pasajeros asignados, ni se dé de baja un bus, una ruta o un horario con turnos activos.

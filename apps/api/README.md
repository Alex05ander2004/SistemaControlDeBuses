# @airova/api

API REST de AIROVA: NestJS 11 + Prisma 7 + PostgreSQL 16.

## Endpoints actuales

| Método | Ruta                                          | Acceso         | Descripción                                                                                                                      |
| ------ | --------------------------------------------- | -------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/health`                                     | público        | Estado de la API y de la base de datos                                                                                           |
| POST   | `/auth/login`                                 | público        | Usuario/correo + contraseña. Límite: 5 por minuto                                                                                |
| POST   | `/auth/refresh`                               | cookie         | Rota el refresh token y emite un access token nuevo                                                                              |
| POST   | `/auth/logout`                                | cookie         | Revoca el refresh token                                                                                                          |
| GET    | `/auth/me`                                    | autenticado    | Usuario de la sesión                                                                                                             |
| GET    | `/users`                                      | ADMIN          | Lista paginada. Filtros: `search`, `role`, `status`, `page`, `pageSize`                                                          |
| GET    | `/users/:id`                                  | ADMIN          | Ficha completa de un usuario                                                                                                     |
| POST   | `/users`                                      | ADMIN          | Crea un usuario (la contraseña se guarda con argon2id)                                                                           |
| PATCH  | `/users/:id`                                  | ADMIN          | Edita datos, rol, estado o restablece la contraseña                                                                              |
| GET    | `/buses`                                      | ADMIN          | Lista paginada. Filtros: `search` (placa, marca, modelo), `status`, `page`, `pageSize`                                           |
| GET    | `/buses/:id`                                  | ADMIN          | Ficha de un bus                                                                                                                  |
| POST   | `/buses`                                      | ADMIN          | Crea un bus (placa en mayúsculas, única)                                                                                         |
| PATCH  | `/buses/:id`                                  | ADMIN          | Edita datos o estado (`ACTIVE`, `MAINTENANCE`, `RETIRED` = baja)                                                                 |
| GET    | `/routes`                                     | ADMIN          | Lista paginada. Filtros: `search` (origen o destino), `active` (true/false), `page`, `pageSize`                                  |
| GET    | `/routes/:id`                                 | ADMIN          | Ficha de una ruta                                                                                                                |
| POST   | `/routes`                                     | ADMIN          | Crea una ruta (activa por defecto)                                                                                               |
| PATCH  | `/routes/:id`                                 | ADMIN          | Edita origen, destino o estado (se desactiva con `active: false`)                                                                |
| GET    | `/schedules`                                  | ADMIN          | Lista paginada, fecha desc. Filtros: `from`, `to` (AAAA-MM-DD), `page`, `pageSize`                                               |
| GET    | `/schedules/:id`                              | ADMIN          | Un horario                                                                                                                       |
| POST   | `/schedules`                                  | ADMIN          | Crea un horario (`date`, `departureTime`, `arrivalTime`)                                                                         |
| PATCH  | `/schedules/:id`                              | ADMIN          | Edita campos sueltos; valida contra el valor actual del otro                                                                     |
| DELETE | `/schedules/:id`                              | ADMIN          | Elimina (204); 409 si algún turno lo usa                                                                                         |
| GET    | `/shifts`                                     | ADMIN          | Lista paginada (fecha desc). Filtros: `from`, `to`, `active`, `routeId`, `busId`, `driverId`, `page`, `pageSize`                 |
| GET    | `/shifts/:id`                                 | ADMIN          | Detalle con el manifiesto de pasajeros                                                                                           |
| POST   | `/shifts`                                     | ADMIN          | Crea un turno (ruta + horario + bus + conductor)                                                                                 |
| PATCH  | `/shifts/:id`                                 | ADMIN          | Cambia recursos o estado (`active`); revalida choques y capacidad                                                                |
| POST   | `/shifts/:id/passengers`                      | ADMIN          | Asigna colaboradores (`workerIds`, hasta 100) sin superar los asientos                                                           |
| DELETE | `/shifts/:id/passengers/:workerId`            | ADMIN          | Quita un pasajero (204) si aún no tiene asistencia registrada                                                                    |
| GET    | `/my/shifts`                                  | DRIVER, WORKER | Mis turnos activos desde hoy (`from`, `to`, `page`, `pageSize`). El conductor ve el avance; el colaborador, su propia asistencia |
| GET    | `/my/shifts/:id`                              | DRIVER, WORKER | Detalle de un turno propio (conductor: manifiesto; colaborador: solo lo suyo). 404 si no es suyo                                 |
| PATCH  | `/shifts/:id/passengers/:workerId/attendance` | ADMIN, DRIVER  | Marca `PRESENT`, `ABSENT` o deshace con `PENDING`                                                                                |
| GET    | `/attendance/overview`                        | ADMIN          | Resumen de asistencia de los turnos activos de un día (`date`, hoy por defecto)                                                  |

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

## Reglas de Turnos

- **Recursos válidos:** la ruta y el bus deben estar activos y el conductor debe tener rol `DRIVER` y estar activo. Al editar solo se exige lo que cambia; al reactivar un turno se revisa todo.
- **Sin choques:** un bus, un conductor o un colaborador no pueden estar en dos turnos **activos** del mismo día cuyos horarios se solapan (llegar justo cuando otro sale no choca). Un turno inactivo no bloquea nada.
- **Capacidad:** los pasajeros no pueden superar los asientos del bus; la asignación es todo o nada. Solo se asignan colaboradores (`WORKER`) activos.
- **Concurrencia:** las escrituras de turnos y pasajeros corren en una transacción con un candado de base de datos (`pg_advisory_xact_lock`), de modo que dos peticiones simultáneas no pueden sobrevender un bus ni crear un choque.
- **Quitar pasajeros:** no se puede quitar a quien ya tiene la asistencia marcada.
- **Reglas hacia los otros módulos:** un bus con turnos activos no puede pasar a mantenimiento ni baja, ni quedarse con menos asientos que los pasajeros de un turno activo; una ruta con turnos activos no se desactiva; un horario usado por turnos no cambia de fecha ni de horas; un conductor con turnos activos no se desactiva ni cambia de rol.
- Todo queda en `audit_logs` (`SHIFT_*`).

## Reglas de Asistencia

- **Quién marca:** el conductor, solo en sus turnos (en los ajenos recibe 404, sin revelar que existen), y el administrador, que puede corregir en cualquier turno activo. El colaborador no marca: solo consulta lo suyo.
- **Cuándo:** el conductor puede marcar desde el día del turno en adelante; antes recibe 409. "Hoy" se calcula con la zona horaria `APP_TIMEZONE` (por defecto `America/Lima`), porque las fechas de los horarios no llevan zona. En un turno inactivo no se registra asistencia.
- **Deshacer:** `PENDING` limpia la marca y quién la hizo. Cada marca guarda `markedAt` y `markedBy` y queda en `audit_logs` (`ATTENDANCE_MARKED`).
- **Privacidad:** el colaborador nunca recibe la lista de los demás pasajeros ni sus datos.
- Una vez marcada la asistencia, el pasajero ya no se puede quitar del turno.

## Deuda conocida

- La unicidad de rutas, horarios y placas (sin distinguir mayúsculas) se valida en el servicio, no en la base: dos peticiones idénticas simultáneas podrían colarse. Cerrarlo requiere una migración con índices únicos (en rutas, sobre `lower(origin), lower(destination)`).
- Las listas "Mis turnos" del conductor y del colaborador piden hasta 50 turnos (sin paginación en pantalla todavía).
- Los selectores del formulario de turnos cargan hasta 100 opciones por lista (límite de paginación de la API); con más datos habrá que usar un selector con búsqueda.
- La concurrencia de turnos está implementada con el candado, pero los tests usan una base embebida de una sola conexión, así que no hay una prueba con peticiones realmente simultáneas.
- No hay asignación de asiento concreto por pasajero (solo conteo contra la capacidad).

## Tests

`DATABASE_POOL_MAX` (opcional) fija el tamaño del pool de conexiones; los tests lo ponen en 1 porque PGlite solo admite una conexión.

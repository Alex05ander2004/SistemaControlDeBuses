# Modelo de datos (borrador)

Convenciones: tablas en `snake_case` plural, claves UUID, `created_at`/`updated_at` en todas, borrado lógico donde aplique, FKs con índices.

```mermaid
erDiagram
  users ||--o{ shifts : "conduce (driver_id)"
  users ||--o{ shift_passengers : "viaja (worker_id)"
  users ||--o{ refresh_tokens : tiene
  users ||--o{ audit_logs : genera
  buses ||--o{ shifts : "asignado a"
  routes ||--o{ shifts : "recorre"
  schedules ||--o{ shifts : "programa"
  shifts ||--o{ shift_passengers : transporta
  shifts ||--o{ reports : "genera"

  users {
    uuid id PK
    string full_name
    string username UK
    string email UK
    string password_hash
    string dni UK
    date birth_date
    enum sex
    string phone
    string address
    enum role "ADMIN|WORKER|DRIVER"
    enum status "ACTIVE|INACTIVE"
    string photo_url
  }
  buses {
    uuid id PK
    string plate UK
    string brand
    string model
    int seats
    enum status "ACTIVE|MAINTENANCE|RETIRED"
  }
  routes {
    uuid id PK
    string origin
    string destination
    bool active
  }
  schedules {
    uuid id PK
    date date
    time departure_time
    time arrival_time
  }
  shifts {
    uuid id PK
    uuid route_id FK
    uuid schedule_id FK
    uuid bus_id FK
    uuid driver_id FK
    bool active
  }
  shift_passengers {
    uuid id PK
    uuid shift_id FK
    uuid worker_id FK
    enum attendance "PENDING|PRESENT|ABSENT"
    timestamp marked_at
    uuid marked_by FK
  }
  reports {
    uuid id PK
    uuid shift_id FK
    uuid author_id FK
    text notes
  }
  refresh_tokens {
    uuid id PK
    uuid user_id FK
    string token_hash
    timestamp expires_at
    timestamp revoked_at
  }
  audit_logs {
    uuid id PK
    uuid user_id FK
    string action
    string entity
    string entity_id
    json changes
  }
```

## Reglas de integridad

- `shift_passengers`: único `(shift_id, worker_id)`; el conteo no puede superar `buses.seats`.
- `shifts.driver_id` debe apuntar a un usuario con rol DRIVER; `shift_passengers.worker_id` a un WORKER (validado en el servicio).
- Un bus o chofer no puede estar en dos turnos con horarios solapados (validado en el servicio; evaluar restricción de exclusión en PostgreSQL).
- Las tablas puente `Turno_Ruta`, `Turno_Horario` y `Turno_Bus` del legado se eliminan: eran redundantes.
- `users.birth_date` reemplaza al campo `Edad` (la edad se calcula).

## Mapeo desde el legado

| Legado                    | Nuevo                              |
| ------------------------- | ---------------------------------- |
| Cargo (1/2/3)             | `users.role` (ADMIN/WORKER/DRIVER) |
| Usuario                   | users                              |
| Bus, Ruta, Horario, Turno | buses, routes, schedules, shifts   |
| Asistencia                | shift_passengers.attendance        |
| Reporte                   | reports                            |

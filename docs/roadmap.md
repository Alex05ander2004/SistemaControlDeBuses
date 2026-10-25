# Roadmap

| Fase | Contenido                                                                                                 | Estado    |
| ---- | --------------------------------------------------------------------------------------------------------- | --------- |
| 0    | Fundamentos: monorepo, convenciones, Docker, CI, ADR, docs                                                | Hecha     |
| 1    | Diseño: requisitos, modelo ER, sistema de diseño (Stitch), scaffold de `web`                              | Hecha     |
| 2    | Backend base: scaffold NestJS, Prisma, migraciones, seed, auth + RBAC                                     | Hecha     |
| 3    | Módulos (vertical API + UI + tests): Usuarios → Buses → Rutas → Horarios → Turnos → Asistencia → Reportes | Pendiente |
| 4    | Calidad: revisión de código, auditoría de seguridad, E2E, accesibilidad                                   | Pendiente |
| 5    | Despliegue y documentación final                                                                          | Pendiente |

## Extras previstos (tras el MVP)

- Dashboard con métricas
- Reportes exportables (PDF/CSV)
- Auditoría de cambios
- Validación de choques: un chofer o bus no puede estar en dos turnos solapados

## Criterio de "hecho" por módulo

Migración aplicada, endpoints con validación y guards por rol, UI con estados de carga/error/vacío, tests de API y un flujo E2E.

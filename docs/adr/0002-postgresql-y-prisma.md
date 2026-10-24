# ADR 0002 - PostgreSQL 16 + Prisma

**Estado:** aceptada

## Contexto

El legado usaba MySQL con un esquema sin FKs ni migraciones y con IDs calculados con `MAX()+1`.

## Decisión

PostgreSQL 16 con Prisma como ORM y sistema de migraciones. IDs UUID generados por la BD. Enums nativos para roles y estados. Fotos fuera de la BD (almacenamiento de archivos con URL).

## Consecuencias

- Esquema versionado y reproducible (`prisma migrate`, seed).
- Posibilidad de restricciones de exclusión para evitar turnos solapados.

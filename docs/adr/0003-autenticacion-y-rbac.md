# ADR 0003 - Autenticación y autorización

**Estado:** aceptada

## Contexto

El legado no autenticaba la API; la protección de rutas existía solo en el cliente, y el login devolvía el hash.

## Decisión

- Token de acceso JWT de vida corta (15 min) en memoria del cliente.
- Refresh token rotativo en cookie `httpOnly`, `Secure`, `SameSite=Lax`, guardado hasheado en la BD.
- Hash de contraseñas con argon2 (alternativa: bcrypt con coste >= 12).
- RBAC con guards de NestJS y decorador `@Roles()`; deny by default.
- `helmet`, rate limiting en login, CORS restringido al origen del web, validación de DTOs.
- El rol solo lo asigna un ADMIN; el registro público no existe.

## Consecuencias

- Nunca se serializa `password_hash` (DTOs de salida explícitos).
- El frontend solo oculta UI según rol; la seguridad real vive en la API.

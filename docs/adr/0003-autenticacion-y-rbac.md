# ADR 0003 - Autenticación y autorización

**Estado:** aceptada

## Contexto

El legado no autenticaba la API; la protección de rutas existía solo en el cliente, y el login devolvía el hash.

## Decisión

- Token de acceso JWT de vida corta (15 min) en memoria del cliente.
- Refresh token opaco (48 bytes aleatorios) y rotativo, en cookie `httpOnly`, `Secure` (en producción), `SameSite=Lax`, `Path=/auth`; en la BD solo se guarda su hash SHA-256.
- Reutilizar un refresh token ya rotado hace más de 10 s se interpreta como robo y revoca todas las sesiones del usuario. Dentro de esos 10 s (doble pestaña, doble efecto en desarrollo) solo se rechaza la petición, sin tocar la cookie ni el resto de sesiones.
- Hash de contraseñas con argon2 (alternativa: bcrypt con coste >= 12).
- RBAC con guards de NestJS y decorador `@Roles()`; deny by default.
- `helmet`, rate limiting en login, CORS restringido al origen del web, validación de DTOs.
- El rol solo lo asigna un ADMIN; el registro público no existe.
- Guards globales en este orden: límite de peticiones (login: 5 por minuto), autenticación (todo exige token salvo `@Public()`) y roles (`@Roles()`).
- El access token no se revalida contra la BD en cada petición: un usuario desactivado conserva acceso hasta 15 min como máximo, pero no puede renovar la sesión.

## Consecuencias

- Nunca se serializa `password_hash` (DTOs de salida explícitos).
- El frontend solo oculta UI según rol; la seguridad real vive en la API.

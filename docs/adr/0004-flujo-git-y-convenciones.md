# ADR 0004 - Flujo de Git y convenciones

**Estado:** aceptada

## Decisión

- Todos los comandos de git/GitHub los ejecuta el propietario del repo; las herramientas de IA solo editan archivos y sugieren mensajes.
- Ramas: `main` protegida; trabajo en `feat/<modulo>`, `fix/<tema>`, `docs/<tema>`, integrado vía PR con CI en verde.
- Commits en inglés con Conventional Commits (`feat(api): add buses module`).
- Un PR por módulo/vertical.

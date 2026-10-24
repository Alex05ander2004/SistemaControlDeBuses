# @airova/web

Frontend de AIROVA: React 19 + Vite + TypeScript + Tailwind v4. Componentes base al estilo shadcn/ui (`src/components/ui`), tokens de diseño en `src/index.css` (tomados de `docs/design/stitch/design-system/DESIGN.md`).

## Comandos (desde la raíz del monorepo)

```sh
npm run dev:web          # servidor de desarrollo en http://localhost:5173
npm run lint --workspace @airova/web
npm test --workspace @airova/web
npm run build --workspace @airova/web
```

## Login simulado (solo desarrollo)

Mientras no exista la API (Fase 2), `.env.development` activa `VITE_MOCK_AUTH=true`, que solo funciona con `import.meta.env.DEV`. Usuarios: `admin`, `conductor` y `colaborador`, con cualquier contraseña. Al conectar la API se elimina la simulación.

## Estructura

- `src/features/<modulo>`: páginas, servicios y hooks de cada módulo
- `src/components`: UI compartida (`ui/`, `layout/`)
- `src/lib`: utilidades y cliente HTTP (el token de acceso vive solo en memoria)
- `src/router.tsx`: rutas y guards por rol (solo UX; la seguridad real es de la API)

# Diseño

Referencia visual generada con Google Stitch. Está en `stitch/` (cada pantalla trae `screen.png` y `code.html`; el sistema de diseño está en `stitch/design-system/DESIGN.md`).

## Pantallas

| #   | Pantalla                   | Carpeta                                  | Rol    | Ruta prevista     |
| --- | -------------------------- | ---------------------------------------- | ------ | ----------------- |
| 1   | Inicio de sesión           | `1._iniciar_sesi_n_airova`               | todos  | `/login`          |
| 2   | Dashboard administrativo   | `2._dashboard_administrativo_airova`     | ADMIN  | `/`               |
| 3   | Tabla de flota (buses)     | `3._tabla_de_flota_de_buses_airova`      | ADMIN  | `/buses`          |
| 4   | Formulario de usuario      | `4._formulario_de_usuario_airova`        | ADMIN  | `/usuarios/nuevo` |
| 5   | Detalle de turno           | `5._detalle_de_turno_y_pasajeros_airova` | ADMIN  | `/turnos/:id`     |
| 6   | Vista móvil de conductor   | `6._vista_m_vil_conductor_airova`        | DRIVER | `/conductor`      |
| 7   | Vista móvil de colaborador | `7._vista_m_vil_colaborador_airova`      | WORKER | `/colaborador`    |

## Cómo se usa

- Es **referencia**, no código a copiar: los `code.html` usan Tailwind por CDN y Material Symbols. En el proyecto real se reimplementa con Tailwind compilado, shadcn/ui e iconos Lucide.
- Tokens (colores, tipografía Inter, radios, espaciado) se pasan a la configuración de Tailwind en la Fase 1.
- Cifras, nombres y fotos de las capturas son datos de ejemplo.

## Elementos de Stitch fuera del alcance del MVP

Stitch añadió funciones que **no están en `docs/requirements.md`** y no se implementan por ahora: telemetría y GPS en tiempo real, mapa de rutas, canal de radio, escaneo de carnet/NFC, alertas de flota, reasignación de chofer desde alertas, "Reportar falla" y combustible. En esas zonas se usará contenido estático o se omitirán hasta decidir si pasan al roadmap.

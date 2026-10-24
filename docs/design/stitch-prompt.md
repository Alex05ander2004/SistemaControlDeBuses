# Prompt para Google Stitch

Pega el bloque siguiente en Stitch (modo web, escritorio). Genera primero el sistema de diseño y las pantallas clave; luego pídele variantes móviles. Devuélveme el resultado (capturas, HTML/CSS exportado o el enlace) y yo lo traduzco a componentes React + Tailwind + shadcn/ui.

## Prompt principal

```
Design a modern, clean web admin application called "AIROVA", a bus fleet and shift control system for a company that transports its workers. Language of the UI: Spanish.

Style: professional, trustworthy, light theme with an optional dark theme. Primary color: deep blue (#1D4ED8) with a warm accent (amber #F59E0B) for highlights and alerts. Neutral grays for surfaces. Rounded corners (12px), soft shadows, generous whitespace, Inter font. Accessible contrast (WCAG AA). Use simple line icons (Lucide style).

Layout: left sidebar navigation (Dashboard, Usuarios, Buses, Rutas, Horarios, Turnos, Asistencia, Reportes), top bar with search, notifications and user menu. Mobile: bottom navigation for drivers.

Screens to generate:
1. Login: split screen, brand illustration of buses on the left, form (usuario, contraseña, "Recordarme", button "Ingresar") on the right.
2. Admin dashboard: 4 KPI cards (Buses activos, Turnos de hoy, Pasajeros asignados, Asistencia del día %), a bar chart of attendance by week, a table of upcoming shifts with status badges.
3. Data table screen (Buses): search, filters by status, table (Placa, Marca, Modelo, Asientos, Estado), row actions (editar, eliminar), "Nuevo bus" button, pagination, empty state.
4. Create/edit form (Usuario): photo upload, fields (nombre completo, usuario, email, DNI, fecha de nacimiento, sexo, celular, dirección, rol, estado), inline validation errors, Guardar/Cancelar.
5. Shift detail (Turno): route A -> B with times, assigned bus and driver cards, passenger list with seat counter "12/40", button "Asignar pasajeros".
6. Driver mobile view: today's shifts as cards, tapping one opens the passenger list with large Asistió / Faltó toggle buttons and a progress bar.
7. Worker mobile view: profile card and "Mis turnos" list with route and schedule.

Include loading skeletons, error and empty states for the table screen. Keep components consistent so they can be reused as a design system.
```

## Qué devolverme

- Capturas de cada pantalla o el enlace al proyecto de Stitch.
- Si exporta HTML/CSS, el código de al menos login, dashboard y tabla.
- Cambios de paleta o tipografía que hayas hecho.

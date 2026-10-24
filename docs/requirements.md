# Requisitos (derivados del sistema legado)

## Funcionales

1. **Autenticación**: inicio de sesión con usuario y contraseña; cierre de sesión; redirección según rol.
2. **Usuarios** (ADMIN): crear, listar, editar, desactivar. Campos: nombre, usuario, contraseña, DNI, fecha de nacimiento, sexo, celular, email, dirección, rol, foto, estado.
   - Regla legada: edad entre 18 y 60 años.
   - Solo un ADMIN puede asignar roles.
3. **Buses** (ADMIN): placa, marca, modelo, número de asientos, estado.
4. **Rutas** (ADMIN): punto de salida y de llegada.
5. **Horarios** (ADMIN): fecha, hora de salida y de llegada.
6. **Turnos** (ADMIN): combinan ruta + horario + bus + chofer; pueden activarse o desactivarse.
7. **Asignación de pasajeros** (ADMIN): asignar trabajadores a un turno, sin superar los asientos del bus.
8. **Asistencia** (DRIVER): por turno, marcar a cada pasajero como asistió o faltó.
9. **Vistas por rol**: DRIVER ve sus turnos; WORKER ve su perfil, turnos y rutas.
10. **Reportes**: reporte por turno (encargado, fecha, observaciones).

## No funcionales

- Autenticación y autorización aplicadas en el servidor, nunca solo en el cliente.
- Contraseñas con hash (argon2 o bcrypt); nunca se devuelven en respuestas.
- Validación de entradas en el servidor (Zod/class-validator).
- Identificadores generados por la BD; sin `MAX(id)+1`.
- Interfaz responsive y accesible (WCAG AA).
- Tests automáticos en CI.

## Problemas del legado que NO se deben replicar

Ver el diagnóstico inicial: API sin auth, login que devuelve el hash, rol elegible en el registro, contraseña `NULL` al editar sin cambiar clave, esquema SQL desalineado con el código, rutas duplicadas, URLs fijas en el frontend.

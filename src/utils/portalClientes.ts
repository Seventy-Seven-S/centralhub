/**
 * El portal de clientes está APAGADO por instrucción del arquitecto
 * (2026-09-22): por ahora los clientes no tendrán acceso a esa plataforma.
 *
 * Mientras esté en false:
 *  - el correo de bienvenida no menciona el portal ni trae el enlace de
 *    activación;
 *  - el equipo no puede mandar el enlace de acceso desde la ficha del cliente
 *    (el botón ni aparece).
 * La cuenta del portal se sigue creando con el contrato (inactiva y sin
 * contraseña utilizable), así que encenderlo solo requiere poner esto en true
 * y reenviar el acceso a quien lo pida.
 *
 * Vive aparte de email.service para que el correo, el alta del contrato y el
 * endpoint de reenvío lean la misma bandera.
 */
export const PORTAL_DE_CLIENTES_ACTIVO = false;

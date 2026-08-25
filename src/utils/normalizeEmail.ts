// Única normalización de email del sistema — usarla siempre antes de
// buscar (findUnique) o guardar (create) un email, en cualquier tabla
// (users, client_users). A propósito NO usa express-validator's
// normalizeEmail(): esa función elimina puntos y "+subaddress" en
// direcciones Gmail por defecto, lo que rompe el login de cualquier
// usuario cuyo email tenga un punto (ej. remocas.mat@gmail.com).
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

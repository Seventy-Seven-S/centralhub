// Datos fiscales de la empresa — única fuente de verdad del lado backend.
//
// Existe un gemelo en frontend/src/components/pdf/reciboHelpers.ts para los
// PDF (no se puede importar a través del límite front/back). Los dos valores
// DEBEN coincidir; el test empresaDatos.test.ts falla si alguien vuelve a
// escribir un domicilio a mano en cualquier plantilla.
//
// Motivo del cambio: la dirección estaba copiada en cuatro documentos y el
// estado de cuenta y los correos se quedaron con la vieja (Av. Las Arboledas),
// mandando a los clientes un domicilio que ya no existe.
export const NOMBRE_EMPRESA = 'Central Inmobiliaria';
export const DIRECCION_EMPRESA = 'C. Dieciséis 530, San Francisco, 87350 Heroica Matamoros, Tamps.';
export const TELEFONOS_EMPRESA = '868 156 1069 / 868 363 0211';
export const PIE_EMPRESA = `${DIRECCION_EMPRESA} · Tel: ${TELEFONOS_EMPRESA}`;

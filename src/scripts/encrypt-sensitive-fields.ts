/**
 * encrypt-sensitive-fields.ts — Cifra en reposo (AES-256-GCM) los campos
 * sensibles ya existentes en BD: clients.{ine,curp,estadoCivil,lugarNacimiento}
 * y co_owners.{ine,estadoCivil,lugarNacimiento}.
 *
 * Idempotente: los valores ya cifrados (prefijo enc:v1:) se saltan; correr
 * dos veces no doble-cifra. Por DEFECTO es DRY-RUN; escribe solo con --confirm.
 *
 * USO
 *   tsx src/scripts/encrypt-sensitive-fields.ts            # dry-run
 *   tsx src/scripts/encrypt-sensitive-fields.ts --confirm  # cifra de verdad
 */
import { PrismaClient } from '@prisma/client';
import { encryptField, isEncrypted, CLIENT_SENSITIVE_FIELDS, COOWNER_SENSITIVE_FIELDS } from '../utils/fieldCrypto';

const prisma = new PrismaClient();
const CONFIRM = process.argv.includes('--confirm');

async function processTable(
  label: string,
  rows: Array<Record<string, any>>,
  fields: readonly string[],
  update: (id: string, data: Record<string, string>) => Promise<unknown>,
): Promise<void> {
  let updated = 0;
  let skipped = 0;

  for (const row of rows) {
    const data: Record<string, string> = {};
    for (const f of fields) {
      const v = row[f];
      if (typeof v === 'string' && v !== '' && !isEncrypted(v)) {
        data[f] = encryptField(v)!;
      }
    }
    if (Object.keys(data).length === 0) { skipped++; continue; }
    if (CONFIRM) await update(row.id, data);
    updated++;
  }

  console.log(`${label}: ${updated} filas ${CONFIRM ? 'cifradas' : 'POR cifrar (dry-run)'}, ${skipped} sin cambios`);
}

async function main() {
  const clients = await prisma.client.findMany({
    select: { id: true, ine: true, curp: true, estadoCivil: true, lugarNacimiento: true },
  });
  await processTable('clients', clients, CLIENT_SENSITIVE_FIELDS, (id, data) =>
    prisma.client.update({ where: { id }, data }),
  );

  const coOwners = await prisma.coOwner.findMany({
    select: { id: true, ine: true, estadoCivil: true, lugarNacimiento: true },
  });
  await processTable('co_owners', coOwners, COOWNER_SENSITIVE_FIELDS, (id, data) =>
    prisma.coOwner.update({ where: { id }, data }),
  );

  if (!CONFIRM) console.log('\n(DRY-RUN — nada escrito. Usa --confirm para cifrar.)');
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());

import bcrypt from 'bcrypt';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const email = 'info@seventyss.com';

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`Usuario ${email} ya existe. No se realizaron cambios.`);
    return;
  }

  const password = await bcrypt.hash('admin123', 10);

  const user = await prisma.user.create({
    data: {
      firstName: 'Admin',
      lastName:  'Central',
      email,
      password,
      role:   'ADMIN',
      status: 'ACTIVE',
    },
  });

  console.log(`Usuario admin creado: ${user.email} (id: ${user.id})`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());

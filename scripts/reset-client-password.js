const bcrypt = require('bcrypt');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const hash = await bcrypt.hash('cliente123', 10);
  await prisma.clientUser.update({
    where: { email: 'test@centralhub.com' },
    data: { password: hash }
  });
  console.log('Contraseña actualizada');
  await prisma.$disconnect();
}

main();

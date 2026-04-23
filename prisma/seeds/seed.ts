// prisma/seeds/seed.ts
import { PrismaClient, LotStatus, ContractStatus, PaymentPlanType, Orientation } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Iniciando seed de datos de prueba...\n');

  console.log('👤 Creando usuario admin...');
  const hashedPassword = await bcrypt.hash('Admin123!', 10);
  
  const admin = await prisma.user.upsert({
    where: { email: 'admin@centralhub.com' },
    update: {},
    create: {
      email: 'admin@centralhub.com',
      password: hashedPassword,
      firstName: 'Admin',
      lastName: 'Central',
      role: 'ADMIN',
      status: 'ACTIVE',
    },
  });
  console.log(`✅ Usuario: ${admin.email}\n`);

  console.log('🏗️  Creando proyectos...');
  
  const proyecto1 = await prisma.project.upsert({
    where: { code: 'VSR' },
    update: {},
    create: {
      code: 'VSR',
      name: 'Valle del Sol Residencial',
      description: 'Desarrollo residencial premium',
      location: 'Matamoros, Tamaulipas',
      city: 'Matamoros',
      state: 'Tamaulipas',
      startDate: new Date('2024-01-15'),
      status: 'ACTIVE',
      totalLots: 50,
      commissionType: 'PERCENTAGE',
      commissionValue: 4.0,
    },
  });

  const proyecto2 = await prisma.project.upsert({
    where: { code: 'MDS' },
    update: {},
    create: {
      code: 'MDS',
      name: 'Magnolia del Sur',
      description: 'Fraccionamiento familiar',
      location: 'Matamoros, Tamaulipas',
      city: 'Matamoros',
      state: 'Tamaulipas',
      startDate: new Date('2023-06-01'),
      status: 'ACTIVE',
      totalLots: 30,
      commissionType: 'FIXED',
      commissionValue: 25000,
    },
  });

  console.log(`✅ ${proyecto1.name} (${proyecto1.code})`);
  console.log(`✅ ${proyecto2.name} (${proyecto2.code})\n`);

  console.log('🏘️  Creando lotes...');
  
  const lotesVSR = [];
  
  for (let i = 1; i <= 5; i++) {
    const lote = await prisma.lot.create({
      data: {
        projectId: proyecto1.id,
        manzana: 1,
        lotNumber: `A-${i.toString().padStart(2, '0')}`,
        areaM2: 200 + (i * 10),
        orientation: i % 2 === 0 ? Orientation.NORTH : Orientation.SOUTH,
        basePrice: 450000,
        currentPrice: 450000 + (i * 5000),
        status: i <= 2 ? LotStatus.SOLD : (i === 3 ? LotStatus.RESERVED : LotStatus.AVAILABLE),
        reservedAt: i === 3 ? new Date() : null,
        reservationExpiry: i === 3 ? new Date(Date.now() + 21 * 24 * 60 * 60 * 1000) : null,
        reservationDeposit: i === 3 ? 5000 : null,
      },
    });
    lotesVSR.push(lote);
  }

  for (let i = 1; i <= 5; i++) {
    const lote = await prisma.lot.create({
      data: {
        projectId: proyecto1.id,
        manzana: 2,
        lotNumber: `B-${i.toString().padStart(2, '0')}`,
        areaM2: 180 + (i * 15),
        orientation: i % 2 === 0 ? Orientation.EAST : Orientation.WEST,
        basePrice: 380000,
        currentPrice: 380000 + (i * 8000),
        status: LotStatus.AVAILABLE,
      },
    });
    lotesVSR.push(lote);
  }

  const lotesMDS = [];
  
  for (let i = 1; i <= 5; i++) {
    const lote = await prisma.lot.create({
      data: {
        projectId: proyecto2.id,
        manzana: 1,
        lotNumber: `M-${i.toString().padStart(2, '0')}`,
        areaM2: 150 + (i * 20),
        orientation: Orientation.NORTH,
        basePrice: 320000,
        currentPrice: 320000 + (i * 10000),
        status: i === 1 ? LotStatus.SOLD : LotStatus.AVAILABLE,
      },
    });
    lotesMDS.push(lote);
  }

  console.log(`✅ ${lotesVSR.length + lotesMDS.length} lotes creados\n`);

  console.log('👥 Creando clientes...');

  const cliente1 = await prisma.client.create({
    data: {
      globalCode: 'CLI-000001',
      firstName: 'Juan Carlos',
      lastName: 'Rodríguez López',
      email: 'juan.rodriguez@email.com',
      phone: '8681234567',
      address: 'Calle Principal #123',
      city: 'Matamoros',
      state: 'Tamaulipas',
      zipCode: '87300',
      curp: 'ROLJ850615HTSDPN01',
      ine: 'ROLJ850615ABC',
      estadoCivil: 'Soltero',
      lugarNacimiento: 'Matamoros, Tamaulipas',
    },
  });

  const cliente2 = await prisma.client.create({
    data: {
      globalCode: 'CLI-000002',
      firstName: 'María Fernanda',
      lastName: 'Martínez García',
      email: 'maria.martinez@email.com',
      phone: '8689876543',
      address: 'Av. Reforma #456',
      city: 'Matamoros',
      state: 'Tamaulipas',
      zipCode: '87330',
      curp: 'MAGF900315MTSDRC09',
      ine: 'MAGF900315XYZ',
      estadoCivil: 'Casada',
      lugarNacimiento: 'Reynosa, Tamaulipas',
    },
  });

  const cliente3 = await prisma.client.create({
    data: {
      globalCode: 'CLI-000003',
      firstName: 'Roberto',
      lastName: 'González Sánchez',
      email: 'roberto.gonzalez@email.com',
      phone: '8685551234',
      address: 'Blvd. Tamaulipas #789',
      city: 'Matamoros',
      state: 'Tamaulipas',
      zipCode: '87350',
      curp: 'GOSR880720HTSDNB02',
      ine: 'GOSR880720DEF',
      estadoCivil: 'Soltero',
      lugarNacimiento: 'Matamoros, Tamaulipas',
    },
  });

  console.log(`✅ ${cliente1.firstName} ${cliente1.lastName}`);
  console.log(`✅ ${cliente2.firstName} ${cliente2.lastName}`);
  console.log(`✅ ${cliente3.firstName} ${cliente3.lastName}\n`);

  console.log('🔗 Vinculando clientes...');

  await prisma.clientProject.create({
    data: {
      clientId: cliente1.id,
      projectId: proyecto1.id,
      projectCode: 'VSR-001',
    },
  });

  await prisma.clientProject.create({
    data: {
      clientId: cliente2.id,
      projectId: proyecto1.id,
      projectCode: 'VSR-002',
    },
  });

  await prisma.clientProject.create({
    data: {
      clientId: cliente3.id,
      projectId: proyecto2.id,
      projectCode: 'MDS-001',
    },
  });

  console.log(`✅ Clientes vinculados\n`);

  console.log('📄 Creando contratos...');

  const contrato1 = await prisma.contract.create({
    data: {
      contractNumber: 'VSR-CON-0001',
      clientId: cliente1.id,
      projectId: proyecto1.id,
      contractDate: new Date('2024-03-15'),
      status: ContractStatus.ACTIVE,
      totalPrice: 455000,
      downPayment: 91000,
      financingAmount: 364000,
      balance: 364000,
      paymentPlanType: PaymentPlanType.INSTALLMENTS,
      installmentCount: 60,
      installmentAmount: 7280,
      interestRate: 12.0,
      moraMonthsCount: 0,
      startDate: new Date('2024-04-01'),
    },
  });

  await prisma.contractLot.create({
    data: {
      contractId: contrato1.id,
      lotId: lotesVSR[0].id,
      priceAtSale: 455000,
    },
  });

  const contrato2 = await prisma.contract.create({
    data: {
      contractNumber: 'VSR-CON-0002',
      clientId: cliente2.id,
      projectId: proyecto1.id,
      contractDate: new Date('2024-04-20'),
      status: ContractStatus.ACTIVE,
      totalPrice: 460000,
      downPayment: 115000,
      financingAmount: 345000,
      balance: 345000,
      paymentPlanType: PaymentPlanType.INSTALLMENTS,
      installmentCount: 72,
      installmentAmount: 6250,
      interestRate: 10.5,
      moraMonthsCount: 0,
      startDate: new Date('2024-05-01'),
    },
  });

  await prisma.contractLot.create({
    data: {
      contractId: contrato2.id,
      lotId: lotesVSR[1].id,
      priceAtSale: 460000,
    },
  });

  await prisma.coOwner.create({
    data: {
      contractId: contrato2.id,
      firstName: 'Pedro',
      lastName: 'Martínez Ruiz',
      ine: 'MARUPE900315HTSDPD01',
      estadoCivil: 'Casado',
      lugarNacimiento: 'Matamoros, Tamaulipas',
      isPrimary: false,
    },
  });

  const contrato3 = await prisma.contract.create({
    data: {
      contractNumber: 'MDS-CON-0001',
      clientId: cliente3.id,
      projectId: proyecto2.id,
      contractDate: new Date('2024-02-10'),
      status: ContractStatus.ACTIVE,
      totalPrice: 320000,
      downPayment: 96000,
      financingAmount: 224000,
      balance: 224000,
      paymentPlanType: PaymentPlanType.INSTALLMENTS,
      installmentCount: 84,
      installmentAmount: 3916,
      interestRate: 11.0,
      moraMonthsCount: 0,
      startDate: new Date('2024-03-01'),
    },
  });

  await prisma.contractLot.create({
    data: {
      contractId: contrato3.id,
      lotId: lotesMDS[0].id,
      priceAtSale: 320000,
    },
  });

  console.log(`✅ ${contrato1.contractNumber}`);
  console.log(`✅ ${contrato2.contractNumber} (con co-titular)`);
  console.log(`✅ ${contrato3.contractNumber}\n`);

  console.log('🎉 ¡SEED COMPLETO!\n');
  console.log('📊 RESUMEN:');
  console.log('───────────────');
  console.log('✅ Usuarios: 1');
  console.log('✅ Proyectos: 2');
  console.log(`✅ Lotes: ${lotesVSR.length + lotesMDS.length}`);
  console.log('✅ Clientes: 3');
  console.log('✅ Contratos: 3');
  console.log('───────────────\n');
  console.log('🔑 CREDENCIALES:');
  console.log('Email: admin@centralhub.com');
  console.log('Password: Admin123!\n');
}

main()
  .catch((e) => {
    console.error('❌ Error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
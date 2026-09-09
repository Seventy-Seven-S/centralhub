// Seed de datos de PRUEBA para el entorno LOCAL (NO producción).
// Crea: proyecto demo, lote, usuaria MANAGER de prueba, cliente de prueba,
// y un contrato financiado con cuotas generadas (vía ContractService, mismo
// camino que usa la app real) para poder probar el flujo de cobro completo.
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import { ContractService } from '../src/services/contract.service';

const prisma = new PrismaClient();
const contractService = new ContractService();

async function main() {
  console.log('Sembrando datos de prueba en la BD LOCAL...');

  // ── Proyecto demo ──
  const project = await prisma.project.upsert({
    where: { code: 'DEMO' },
    update: {},
    create: {
      code: 'DEMO',
      name: 'Proyecto Demo',
      location: 'Calle de Prueba 123',
      city: 'Heroica Matamoros',
      state: 'Tamaulipas',
      totalLots: 5,
      status: 'ACTIVE',
      commissionType: 'PERCENTAGE',
      commissionValue: 5,
    },
  });

  // ── Lote disponible ──
  let lot = await prisma.lot.findFirst({ where: { projectId: project.id, manzana: 1, lotNumber: '1' } });
  if (!lot) {
    lot = await prisma.lot.create({
      data: {
        projectId: project.id,
        manzana: 1,
        lotNumber: '1',
        areaM2: 200,
        basePrice: 250000,
        currentPrice: 250000,
        status: 'AVAILABLE',
      },
    });
  }

  // ── Usuaria MANAGER de prueba ──
  const hashed = await bcrypt.hash('Prueba123!', 10);
  const manager = await prisma.user.upsert({
    where: { email: 'secretaria.prueba@centralhub.local' },
    update: { password: hashed, status: 'ACTIVE' },
    create: {
      email: 'secretaria.prueba@centralhub.local',
      password: hashed,
      firstName: 'Secretaria',
      lastName: 'De Prueba',
      role: 'MANAGER',
      status: 'ACTIVE',
    },
  });

  // ── Cliente de prueba ──
  const client = await prisma.client.upsert({
    where: { globalCode: 'CLI-DEMO-001' },
    update: {},
    create: {
      globalCode: 'CLI-DEMO-001',
      firstName: 'Juan',
      lastName: 'Pérez Demo',
      email: 'juan.demo@example.com',
      phone: '8681234567',
      status: 'ACTIVE',
    },
  });

  // ── Contrato financiado con cuotas (mismo camino que usa la app real) ──
  const contratoExistente = await prisma.contract.findFirst({ where: { clientId: client.id, projectId: project.id } });
  let contract = contratoExistente;
  if (!contract) {
    contract = await contractService.createContract({
      clientId: client.id,
      projectId: project.id,
      lotIds: [lot.id],
      downPayment: 50000,
      financedAmount: 200000,
      interestRate: 0,
      termMonths: 12,
      startDate: new Date(),
      agentId: manager.id,
    }) as any;
  }

  const cuotas = await prisma.cuota.findMany({ where: { contractId: contract!.id }, orderBy: { numeroCuota: 'asc' } });

  console.log('\n✅ Datos de prueba listos:');
  console.log(`  Usuaria MANAGER: secretaria.prueba@centralhub.local / Prueba123!`);
  console.log(`  Cliente: ${client.firstName} ${client.lastName} (código ${client.globalCode})`);
  console.log(`  Contrato: ${contract!.contractNumber}`);
  console.log(`  Cuotas generadas: ${cuotas.length}, primera pendiente: #${cuotas[0]?.numeroCuota} — ${cuotas[0]?.mes} — $${cuotas[0]?.montoEsperado}`);
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });

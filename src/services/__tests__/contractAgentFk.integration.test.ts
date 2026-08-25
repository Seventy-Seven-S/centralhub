// Test de integración REAL contra Postgres (sin mocks) — un constraint de
// FK a nivel de base de datos no se puede verificar con un Prisma Client
// mockeado. Requiere que la BD local (DATABASE_URL en .env) tenga la
// migración 20260817032349_add_contract_agent_fk aplicada.
import { describe, it, expect, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

afterAll(async () => {
  await prisma.$disconnect();
});

describe('Contract.agentId — integridad referencial forzada por Postgres', () => {
  it('existe un FK real de contracts.agentId → users.id', async () => {
    const rows = await prisma.$queryRaw<Array<{ constraint_name: string; delete_rule: string }>>`
      SELECT tc.constraint_name, rc.delete_rule
      FROM information_schema.table_constraints tc
      JOIN information_schema.referential_constraints rc
        ON tc.constraint_name = rc.constraint_name
      JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name
      WHERE tc.table_name = 'contracts'
        AND tc.constraint_type = 'FOREIGN KEY'
        AND kcu.column_name = 'agentId';
    `;

    expect(rows).toHaveLength(1);
    expect(rows[0].constraint_name).toBe('contracts_agentId_fkey');
  });

  it('el onDelete es SET NULL — un contrato nunca se borra por baja del asesor', async () => {
    const rows = await prisma.$queryRaw<Array<{ delete_rule: string }>>`
      SELECT rc.delete_rule
      FROM information_schema.referential_constraints rc
      WHERE rc.constraint_name = 'contracts_agentId_fkey';
    `;

    expect(rows).toHaveLength(1);
    expect(rows[0].delete_rule).toBe('SET NULL');
  });

  it('un agentId que no corresponde a ningún usuario real es rechazado por Postgres (client/project sí válidos, para aislar específicamente la FK de agentId)', async () => {
    const client = await prisma.client.create({
      data: { globalCode: `TEST-FK-${Date.now()}`, firstName: 'Test', lastName: 'FK', phone: '0000000000' },
    });
    const project = await prisma.project.create({
      data: { code: `TESTFK${Date.now()}`, name: 'Test FK Project', location: 'Test', city: 'Test', state: 'Test', totalLots: 1 },
    });

    try {
      await expect(
        prisma.contract.create({
          data: {
            contractNumber: `TEST-FK-CHECK-${Date.now()}`,
            clientId: client.id,
            projectId: project.id,
            agentId: 'agente-que-no-existe',
            contractDate: new Date(),
            totalPrice: 0,
            downPayment: 0,
            financingAmount: 0,
          },
        }),
      ).rejects.toThrow(/Foreign key constraint|agentId/i);
    } finally {
      await prisma.project.delete({ where: { id: project.id } });
      await prisma.client.delete({ where: { id: client.id } });
    }
  });
});

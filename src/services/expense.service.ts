// src/services/expense.service.ts
import { PrismaClient } from '@prisma/client';
import {
  CreateExpenseCategoryDto,
  UpdateExpenseCategoryDto,
  CreateExpenseDto,
  UpdateExpenseDto,
  ExpenseFilters,
} from '../types/expense.types';

const prisma = new PrismaClient();

export class ExpenseService {

  // ── Categories ──────────────────────────────────────────────────────────────

  async createCategory(data: CreateExpenseCategoryDto, userId: string) {
    return prisma.expenseCategory.create({
      data: {
        name:        data.name,
        description: data.description,
        createdById: userId,
      },
    });
  }

  async getAllCategories() {
    return prisma.expenseCategory.findMany({
      orderBy: { name: 'asc' },
      include: {
        _count: { select: { expenses: true } },
      },
    });
  }

  async updateCategory(id: string, data: UpdateExpenseCategoryDto) {
    const category = await prisma.expenseCategory.findUnique({ where: { id } });
    if (!category) throw new Error('Categoría no encontrada');

    return prisma.expenseCategory.update({
      where: { id },
      data: {
        ...(data.name        !== undefined && { name:        data.name }),
        ...(data.description !== undefined && { description: data.description }),
      },
    });
  }

  async deleteCategory(id: string) {
    const category = await prisma.expenseCategory.findUnique({
      where: { id },
      include: { _count: { select: { expenses: true } } },
    });
    if (!category) throw new Error('Categoría no encontrada');
    if (category._count.expenses > 0) {
      throw new Error(
        `No se puede eliminar: la categoría tiene ${category._count.expenses} gasto(s) asociado(s)`
      );
    }

    return prisma.expenseCategory.delete({ where: { id } });
  }

  // ── Expenses ─────────────────────────────────────────────────────────────────

  async createExpense(data: CreateExpenseDto, userId: string) {
    const project = await prisma.project.findUnique({ where: { id: data.projectId } });
    if (!project) throw new Error('Proyecto no encontrado');

    const category = await prisma.expenseCategory.findUnique({ where: { id: data.categoryId } });
    if (!category) throw new Error('Categoría no encontrada');

    return prisma.expense.create({
      data: {
        amount:      data.amount,
        description: data.description,
        date:        new Date(data.date),
        projectId:   data.projectId,
        categoryId:  data.categoryId,
        createdById: userId,
      },
      include: {
        project:  { select: { id: true, code: true, name: true } },
        category: { select: { id: true, name: true } },
      },
    });
  }

  async getExpensesByProject(projectId: string, filters: ExpenseFilters) {
    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project) throw new Error('Proyecto no encontrado');

    const where: any = { projectId };
    if (filters.categoryId) where.categoryId = filters.categoryId;
    if (filters.dateFrom || filters.dateTo) {
      where.date = {};
      if (filters.dateFrom) where.date.gte = new Date(filters.dateFrom);
      if (filters.dateTo)   where.date.lte = new Date(filters.dateTo);
    }

    return prisma.expense.findMany({
      where,
      include: {
        project:   { select: { id: true, code: true, name: true } },
        category:  { select: { id: true, name: true } },
        createdBy: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: { date: 'desc' },
    });
  }

  async getExpenseById(id: string) {
    const expense = await prisma.expense.findUnique({
      where: { id },
      include: {
        project:   { select: { id: true, code: true, name: true } },
        category:  { select: { id: true, name: true } },
        createdBy: { select: { id: true, firstName: true, lastName: true } },
      },
    });
    if (!expense) throw new Error('Gasto no encontrado');
    return expense;
  }

  async updateExpense(id: string, data: UpdateExpenseDto) {
    const expense = await prisma.expense.findUnique({ where: { id } });
    if (!expense) throw new Error('Gasto no encontrado');

    if (data.categoryId) {
      const category = await prisma.expenseCategory.findUnique({ where: { id: data.categoryId } });
      if (!category) throw new Error('Categoría no encontrada');
    }

    return prisma.expense.update({
      where: { id },
      data: {
        ...(data.amount      !== undefined && { amount:      data.amount }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.date        !== undefined && { date:        new Date(data.date) }),
        ...(data.categoryId  !== undefined && { categoryId:  data.categoryId }),
      },
      include: {
        project:  { select: { id: true, code: true, name: true } },
        category: { select: { id: true, name: true } },
      },
    });
  }

  async deleteExpense(id: string) {
    const expense = await prisma.expense.findUnique({ where: { id } });
    if (!expense) throw new Error('Gasto no encontrado');
    return prisma.expense.delete({ where: { id } });
  }

  async getSummaryByProject(projectId: string) {
    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project) throw new Error('Proyecto no encontrado');

    const expenses = await prisma.expense.findMany({
      where: { projectId },
      include: { category: { select: { id: true, name: true } } },
    });

    const byCategory = new Map<string, { categoryId: string; categoryName: string; total: number; count: number }>();
    let grandTotal = 0;

    for (const e of expenses) {
      const key = e.categoryId;
      const prev = byCategory.get(key) ?? { categoryId: e.category.id, categoryName: e.category.name, total: 0, count: 0 };
      const amount = Number(e.amount);
      byCategory.set(key, { ...prev, total: prev.total + amount, count: prev.count + 1 });
      grandTotal += amount;
    }

    return {
      projectId,
      projectName: project.name,
      total: grandTotal,
      byCategory: Array.from(byCategory.values()).sort((a, b) => b.total - a.total),
    };
  }
}

export default new ExpenseService();

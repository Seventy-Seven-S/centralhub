// src/controllers/expense.controller.ts
import { Request, Response } from 'express';
import expenseService from '../services/expense.service';
import {
  CreateExpenseCategoryDto,
  UpdateExpenseCategoryDto,
  CreateExpenseDto,
  UpdateExpenseDto,
  ExpenseFilters,
} from '../types/expense.types';

export class ExpenseController {

  // ── Categories ──────────────────────────────────────────────────────────────

  // POST /api/v1/expenses/categories
  async createCategory(req: Request, res: Response) {
    try {
      const data: CreateExpenseCategoryDto = req.body;
      const userId = req.user!.userId;
      const category = await expenseService.createCategory(data, userId);
      res.status(201).json({
        success: true,
        message: 'Categoría creada exitosamente',
        data: category,
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        message: error.message || 'Error al crear categoría',
      });
    }
  }

  // GET /api/v1/expenses/categories
  async getAllCategories(req: Request, res: Response) {
    try {
      const categories = await expenseService.getAllCategories();
      res.status(200).json({
        success: true,
        data: categories,
        count: categories.length,
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: error.message || 'Error al obtener categorías',
      });
    }
  }

  // PUT /api/v1/expenses/categories/:id
  async updateCategory(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const data: UpdateExpenseCategoryDto = req.body;
      const category = await expenseService.updateCategory(id, data);
      res.status(200).json({
        success: true,
        message: 'Categoría actualizada exitosamente',
        data: category,
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        message: error.message || 'Error al actualizar categoría',
      });
    }
  }

  // DELETE /api/v1/expenses/categories/:id
  async deleteCategory(req: Request, res: Response) {
    try {
      const { id } = req.params;
      await expenseService.deleteCategory(id);
      res.status(200).json({
        success: true,
        message: 'Categoría eliminada exitosamente',
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        message: error.message || 'Error al eliminar categoría',
      });
    }
  }

  // ── Expenses ─────────────────────────────────────────────────────────────────

  // POST /api/v1/expenses
  async createExpense(req: Request, res: Response) {
    try {
      const data: CreateExpenseDto = req.body;
      const userId = req.user!.userId;
      const expense = await expenseService.createExpense(data, userId);
      res.status(201).json({
        success: true,
        message: 'Gasto registrado exitosamente',
        data: expense,
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        message: error.message || 'Error al registrar gasto',
      });
    }
  }

  // GET /api/v1/expenses/project/:projectId
  async getExpensesByProject(req: Request, res: Response) {
    try {
      const { projectId } = req.params;
      const filters: ExpenseFilters = {
        projectId,
        categoryId: req.query.categoryId as string | undefined,
        dateFrom:   req.query.dateFrom   as string | undefined,
        dateTo:     req.query.dateTo     as string | undefined,
      };
      const expenses = await expenseService.getExpensesByProject(projectId, filters);
      res.status(200).json({
        success: true,
        data: expenses,
        count: expenses.length,
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        message: error.message || 'Error al obtener gastos del proyecto',
      });
    }
  }

  // GET /api/v1/expenses/:id
  async getExpenseById(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const expense = await expenseService.getExpenseById(id);
      res.status(200).json({
        success: true,
        data: expense,
      });
    } catch (error: any) {
      res.status(404).json({
        success: false,
        message: error.message || 'Gasto no encontrado',
      });
    }
  }

  // PUT /api/v1/expenses/:id
  async updateExpense(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const data: UpdateExpenseDto = req.body;
      const expense = await expenseService.updateExpense(id, data);
      res.status(200).json({
        success: true,
        message: 'Gasto actualizado exitosamente',
        data: expense,
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        message: error.message || 'Error al actualizar gasto',
      });
    }
  }

  // DELETE /api/v1/expenses/:id
  async deleteExpense(req: Request, res: Response) {
    try {
      const { id } = req.params;
      await expenseService.deleteExpense(id);
      res.status(200).json({
        success: true,
        message: 'Gasto eliminado exitosamente',
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        message: error.message || 'Error al eliminar gasto',
      });
    }
  }

  // GET /api/v1/expenses/project/:projectId/summary
  async getProjectExpenseSummary(req: Request, res: Response) {
    try {
      const { projectId } = req.params;
      const summary = await expenseService.getSummaryByProject(projectId);
      res.status(200).json({
        success: true,
        data: summary,
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        message: error.message || 'Error al obtener resumen de gastos',
      });
    }
  }
}

export default new ExpenseController();

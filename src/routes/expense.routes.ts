// src/routes/expense.routes.ts
import { Router } from 'express';
import expenseController from '../controllers/expense.controller';
import { authenticate } from '../middlewares/auth';

const router = Router();

router.use(authenticate);

// ── Categories ──────────────────────────────────────────────────────────────
router.post('/categories',       expenseController.createCategory);
router.get('/categories',        expenseController.getAllCategories);
router.put('/categories/:id',    expenseController.updateCategory);
router.delete('/categories/:id', expenseController.deleteCategory);

// ── Expenses ─────────────────────────────────────────────────────────────────
router.post('/',                               expenseController.createExpense);
// Todos los proyectos juntos. Va antes de "/:id" para que Express no lo trate
// como un id de gasto.
router.get('/',                                expenseController.getAllExpenses);
router.get('/project/:projectId/summary',      expenseController.getProjectExpenseSummary);
router.get('/project/:projectId',              expenseController.getExpensesByProject);
router.get('/:id',                             expenseController.getExpenseById);
router.put('/:id',                             expenseController.updateExpense);
router.delete('/:id',                          expenseController.deleteExpense);

export default router;

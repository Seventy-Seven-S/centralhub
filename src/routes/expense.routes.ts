// src/routes/expense.routes.ts
import { Router } from 'express';
import expenseController from '../controllers/expense.controller';
import { authenticate, authorize } from '../middlewares/auth';
import { soloProyectoDelSocio } from '../middlewares/alcanceProyectos';

const router = Router();

router.use(authenticate);
// Gastos es de ADMIN y MANAGER: la pantalla /gastos (que las secretarias usan
// a diario para capturar, corregir y borrar, categorías incluidas), el
// selector de asesores del alta de contrato y el recibo de comisión. El AGENT
// no tiene ninguna pantalla que lea gastos — antes podía ver todos con solo
// tener sesión.
//
// El SOCIO solo CONSULTA los gastos de un proyecto suyo (y las categorías,
// para filtrar). Esas lecturas van antes del authorize general; todo lo demás
// sigue siendo solo de ADMIN y MANAGER.
const lecturaConSocio = [authorize('ADMIN', 'MANAGER', 'SOCIO'), soloProyectoDelSocio('params')];
router.get('/categories',                 authorize('ADMIN', 'MANAGER', 'SOCIO'), expenseController.getAllCategories);
router.get('/project/:projectId/summary', ...lecturaConSocio, expenseController.getProjectExpenseSummary);
router.get('/project/:projectId',         ...lecturaConSocio, expenseController.getExpensesByProject);

router.use(authorize('ADMIN', 'MANAGER'));

// ── Categories ──────────────────────────────────────────────────────────────
router.post('/categories',       expenseController.createCategory);
router.put('/categories/:id',    expenseController.updateCategory);
router.delete('/categories/:id', expenseController.deleteCategory);

// ── Expenses ─────────────────────────────────────────────────────────────────
router.post('/',                               expenseController.createExpense);
// Todos los proyectos juntos. Va antes de "/:id" para que Express no lo trate
// como un id de gasto.
router.get('/',                                expenseController.getAllExpenses);
router.get('/beneficiarios',                   expenseController.getBeneficiarios);
router.get('/:id',                             expenseController.getExpenseById);
router.put('/:id',                             expenseController.updateExpense);
router.delete('/:id',                          expenseController.deleteExpense);

export default router;

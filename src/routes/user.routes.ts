import { Router } from 'express';
import { authenticate, authorize } from '../middlewares/auth';
import { getUsers, createUser, updateUser, toggleUserStatus } from '../controllers/user.controller';

const router = Router();

router.get('/',             authenticate, authorize('ADMIN'), getUsers);
router.post('/',            authenticate, authorize('ADMIN'), createUser);
router.put('/:id',          authenticate, authorize('ADMIN'), updateUser);
router.patch('/:id/status', authenticate, authorize('ADMIN'), toggleUserStatus);

export default router;

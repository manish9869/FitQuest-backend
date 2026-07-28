import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { listRows, getRow, createRow, updateRow, deleteRow, upsertRow } from '../controllers/dataController.js';

const router = Router();

router.use(requireAuth);

router.get('/:table', listRows);
router.get('/:table/:id', getRow);
router.post('/:table/upsert', upsertRow);
router.post('/:table', createRow);
router.patch('/:table/:id', updateRow);
router.delete('/:table/:id', deleteRow);

export default router;

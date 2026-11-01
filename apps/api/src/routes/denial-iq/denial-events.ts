import express from 'express';
import { listDenialEvents, createDenialEvent, updateDenialEvent } from '../../controllers/denial-iq/denial-events';
import { phiAudit } from '../../middleware/phi-audit';

const router = express.Router();

router.get('/',      listDenialEvents);
router.post('/',     phiAudit('phi.denial-event.create'), createDenialEvent);
router.patch('/:id', phiAudit('phi.denial-event.update'), updateDenialEvent);

export default router;

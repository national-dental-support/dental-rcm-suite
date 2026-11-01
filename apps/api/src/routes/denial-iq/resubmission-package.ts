import express from 'express';
import { ResubmissionPackageController } from '../../controllers/denial-iq/resubmission-package.controller';

const router = express.Router();
const ctrl = new ResubmissionPackageController();

router.get('/:claimId', ctrl.get);
router.post('/:claimId', ctrl.create);
router.patch('/:id', ctrl.update);
router.post('/:claimId/attachments', ctrl.addAttachment);
router.delete('/attachments/:id', ctrl.removeAttachment);

export default router;

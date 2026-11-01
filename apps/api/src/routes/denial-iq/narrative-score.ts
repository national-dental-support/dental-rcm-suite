import express from 'express';
import { NarrativeScoreController } from '../../controllers/denial-iq/narrative-score.controller';

const router = express.Router();
const ctrl = new NarrativeScoreController();

router.get('/:claimId', ctrl.getLatest);
router.post('/:claimId', ctrl.score);

export default router;

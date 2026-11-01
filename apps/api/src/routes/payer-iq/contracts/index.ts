import express from 'express';
import { ContractsController } from '../../../controllers/payer-iq/contracts/contracts-controller';

const router = express.Router();
const getCtrl = () => new ContractsController();

// Specific path routes MUST come before the /:id parameterised routes
router.get('/routing-arbitrage', (req, res) => getCtrl().getRoutingArbitrage(req, res));
router.get('/savings-summary',   (req, res) => getCtrl().getSavingsSummary(req, res));

router.get('/',                  (req, res) => getCtrl().getContracts(req, res));
router.get('/:id/fee-schedule',  (req, res) => getCtrl().getFeeSchedule(req, res));
router.get('/:id/routing-paths', (req, res) => getCtrl().getRoutingPaths(req, res));

export default router;

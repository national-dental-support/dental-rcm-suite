import express from 'express';
import { PayerIQController } from '../../../controllers/payer-iq/index';


const router = express.Router();
const controller = new PayerIQController();

router.get('/charge-amount', controller.getChargeAmount);
router.get('/payer-mix-reimbursement-payment', controller.getPayerMixReimbursementPayment);
router.get('/payer-mix-patient-volume', controller.getPayerMixPatientVolume);
router.get('/payer-mix-cpt-volume', controller.getPayerMixCptVolume);
router.get('/forecasting-payer-payments', controller.getForecastingPayerPayments);
router.get('/cpt-non-payment', controller.getCptNonPayment);
router.get('/payer-details', controller.getPayerDetails);
export default router;
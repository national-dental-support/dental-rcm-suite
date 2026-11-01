import express from 'express';
import PdfGenerate from '../../controllers/pdf/generate';

const router = express.Router();
const controller = new PdfGenerate();

router.get('/generate', controller.get);

export default router;

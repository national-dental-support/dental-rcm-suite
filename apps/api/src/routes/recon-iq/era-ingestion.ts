import { Router, Request, Response } from 'express';
import multer, { memoryStorage } from 'multer';
import { EraIngestionController } from '../../controllers/recon-iq/era-ingestion';
import logger from '../../utils/logger';

const router = Router();
const ctrl = new EraIngestionController();

const upload = multer({
  storage: memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
});

router.post('/upload',    upload.single('file'), ctrl.upload);
router.get('/history',    ctrl.history);
router.post('/fetch-now', async (req: Request, res: Response) => {
  const connectionId = parseInt(String(req.body?.connectionId ?? ''), 10);
  if (!connectionId || isNaN(connectionId)) {
    res.status(400).json({ message: 'connectionId is required' });
    return;
  }
  // On-demand ERA retrieval needs a clearinghouse connector, which is
  // deployment-specific and not shipped with this suite. Upload an 835 through
  // POST /api/recon-iq/era-ingestion instead - see docs/first-install.md.
  res.status(501).json({
    message: 'Automated ERA retrieval is not configured. Upload an 835 file instead.',
    code: 'ERA_FETCH_NOT_CONFIGURED',
  });
});
router.get('/demo-file',  ctrl.downloadDemoFile);
router.get('/:id',        ctrl.getDetail);

export default router;

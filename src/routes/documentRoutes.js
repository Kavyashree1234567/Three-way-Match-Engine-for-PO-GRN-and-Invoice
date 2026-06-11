import express from 'express';
import {
  getDocumentById,
  getMatch,
  uploadDocument
} from '../controllers/documentController.js';
import upload from '../middlewares/uploadMiddleware.js';

const router = express.Router();

router.post('/documents/upload', upload.single('file'), uploadDocument);
router.get('/documents/:id', getDocumentById);
router.get('/match/:poNumber', getMatch);

export default router;

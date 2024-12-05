import express from 'express';
import { adminAuthMiddleware } from '../middleware/adminAuth';
import {
    getCollections,
    getDocuments,
    updateDocument,
    deleteDocument,
    getStats
} from '../controllers/adminController';

const router = express.Router();

// Apply adminAuthMiddleware to all routes
router.use(adminAuthMiddleware);

// Admin routes
router.get('/collections', getCollections);
router.get('/collections/:collection', getDocuments);
router.put('/collections/:collection/:id', updateDocument);
router.delete('/collections/:collection/:id', deleteDocument);
router.get('/stats', getStats);

export default router; 
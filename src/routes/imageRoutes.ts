import express, { Response, Request, RequestHandler } from 'express';
import { upload } from '../middleware/uploadMiddleware';
import { authMiddleware, requireAuth, AuthRequest } from '../middleware/auth';
import * as multer from 'multer';

const router = express.Router();

const uploadHandler: RequestHandler = async (req, res) => {
    const authenticatedReq = req as AuthRequest & { file?: Express.Multer.File };
    console.log('Received image upload request');
    console.log('Request headers:', authenticatedReq.headers);
    console.log('Request file:', authenticatedReq.file);
    console.log('User ID from auth:', authenticatedReq.userId);

    if (!authenticatedReq.file) {
        console.error('No file in request');
        return res.status(400).json({ error: 'No file uploaded' });
    }

    try {
        const imageUrl = `${authenticatedReq.protocol}://${authenticatedReq.get('host')}/uploads/${authenticatedReq.file.filename}`;
        console.log('Generated image URL:', imageUrl);
        res.json({
            imageUrl,
            userId: authenticatedReq.userId
        });
    } catch (error) {
        console.error('Error processing upload:', error);
        res.status(500).json({ error: 'Failed to process upload' });
    }
};

router.post('/upload', authMiddleware, upload.single('image'), uploadHandler);

export default router; 
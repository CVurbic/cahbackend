import express from 'express';
import { getUserNotifications, markNotificationRead } from '../controllers/notificationController';

const router = express.Router();

router.get('/user/:username', getUserNotifications);
router.put('/:notificationId/read', markNotificationRead);

export default router; 
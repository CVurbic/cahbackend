import { Request, Response } from 'express';
import Notification from '../models/Notification';

export const createNotification = async (
    userId: string,
    username: string,
    type: 'gameInvite' | 'gameUpdate' | 'system',
    content: any
) => {
    try {
        const existingNotification = await Notification.findOne({
            username,
            type,
            'content.gameId': content.gameId,
            'content.from': content.from,
            read: false
        });

        if (existingNotification) {
            console.log('Similar notification already exists');
            return existingNotification;
        }

        const notification = new Notification({
            userId,
            username,
            type,
            content,
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
        });

        await notification.save();
        console.log('New notification created:', notification);
        return notification;
    } catch (error) {
        console.error('Error creating notification:', error);
        throw error;
    }
};

export const getUserNotifications = async (req: Request, res: Response) => {
    try {
        const { username } = req.params;
        const notifications = await Notification.find({
            username,
            read: false,
            expiresAt: { $gt: new Date() }
        }).sort({ createdAt: -1 });
        res.json(notifications);
    } catch (error) {
        console.error('Error fetching notifications:', error);
        res.status(500).json({ message: 'Error fetching notifications' });
    }
};

export const markNotificationRead = async (req: Request, res: Response) => {
    try {
        const { notificationId } = req.params;
        const notification = await Notification.findByIdAndUpdate(
            notificationId,
            { read: true },
            { new: true }
        );

        if (!notification) {
            return res.status(404).json({ message: 'Notification not found' });
        }

        res.json({ message: 'Notification marked as read', notification });
    } catch (error) {
        console.error('Error marking notification as read:', error);
        res.status(500).json({ message: 'Error updating notification' });
    }
}; 
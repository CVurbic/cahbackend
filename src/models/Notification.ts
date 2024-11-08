import mongoose, { Schema, Document } from 'mongoose';

export interface INotification extends Document {
    userId: string;
    username: string;
    type: 'gameInvite' | 'gameUpdate' | 'system';
    content: {
        id: string;
        from?: string;
        gameId?: string;
        playerId?: string;
        message?: string;
        time: Date;
    };
    read: boolean;
    createdAt: Date;
    expiresAt: Date;
}

const NotificationSchema = new Schema({
    userId: { type: String, required: true },
    username: { type: String, required: true, index: true },
    type: {
        type: String,
        required: true,
        enum: ['gameInvite', 'gameUpdate', 'system']
    },
    content: {
        id: String,
        from: String,
        gameId: String,
        playerId: String,
        message: String,
        time: { type: Date, default: Date.now }
    },
    read: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now },
    expiresAt: { type: Date, index: true }
});

// Add index for querying unread notifications
NotificationSchema.index({ username: 1, read: 1 });

// Automatically delete expired notifications
NotificationSchema.index({ expiresAt: 1 }, {
    expireAfterSeconds: 0
});

export default mongoose.model<INotification>('Notification', NotificationSchema); 
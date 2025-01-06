"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.markNotificationRead = exports.getUserNotifications = exports.createNotification = void 0;
const Notification_1 = __importDefault(require("../models/Notification"));
const createNotification = (userId, username, type, content) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const existingNotification = yield Notification_1.default.findOne({
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
        const notification = new Notification_1.default({
            userId,
            username,
            type,
            content,
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
        });
        yield notification.save();
        console.log('New notification created:', notification);
        return notification;
    }
    catch (error) {
        console.error('Error creating notification:', error);
        throw error;
    }
});
exports.createNotification = createNotification;
const getUserNotifications = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { username } = req.params;
        const notifications = yield Notification_1.default.find({
            username,
            read: false,
            expiresAt: { $gt: new Date() }
        }).sort({ createdAt: -1 });
        res.json(notifications);
    }
    catch (error) {
        console.error('Error fetching notifications:', error);
        res.status(500).json({ message: 'Error fetching notifications' });
    }
});
exports.getUserNotifications = getUserNotifications;
const markNotificationRead = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { notificationId } = req.params;
        const notification = yield Notification_1.default.findByIdAndUpdate(notificationId, { read: true }, { new: true });
        if (!notification) {
            return res.status(404).json({ message: 'Notification not found' });
        }
        res.json({ message: 'Notification marked as read', notification });
    }
    catch (error) {
        console.error('Error marking notification as read:', error);
        res.status(500).json({ message: 'Error updating notification' });
    }
});
exports.markNotificationRead = markNotificationRead;

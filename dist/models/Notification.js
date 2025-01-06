"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = __importStar(require("mongoose"));
const NotificationSchema = new mongoose_1.Schema({
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
exports.default = mongoose_1.default.model('Notification', NotificationSchema);

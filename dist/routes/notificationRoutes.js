"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const notificationController_1 = require("../controllers/notificationController");
const router = express_1.default.Router();
router.get('/user/:username', notificationController_1.getUserNotifications);
router.put('/:notificationId/read', notificationController_1.markNotificationRead);
exports.default = router;

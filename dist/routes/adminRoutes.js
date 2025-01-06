"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const adminAuth_1 = require("../middleware/adminAuth");
const adminController_1 = require("../controllers/adminController");
const router = express_1.default.Router();
// Apply adminAuthMiddleware to all routes
router.use(adminAuth_1.adminAuthMiddleware);
// Admin routes
router.get('/collections', adminController_1.getCollections);
router.get('/collections/:collection', adminController_1.getDocuments);
router.put('/collections/:collection/:id', adminController_1.updateDocument);
router.delete('/collections/:collection/:id', adminController_1.deleteDocument);
router.get('/stats', adminController_1.getStats);
exports.default = router;

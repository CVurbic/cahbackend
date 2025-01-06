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
const express_1 = __importDefault(require("express"));
const uploadMiddleware_1 = require("../middleware/uploadMiddleware");
const auth_1 = require("../middleware/auth");
const router = express_1.default.Router();
const uploadHandler = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const authenticatedReq = req;
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
    }
    catch (error) {
        console.error('Error processing upload:', error);
        res.status(500).json({ error: 'Failed to process upload' });
    }
});
router.post('/upload', auth_1.authMiddleware, uploadMiddleware_1.upload.single('image'), uploadHandler);
exports.default = router;

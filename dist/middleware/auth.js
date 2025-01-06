"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireAuth = exports.authMiddleware = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret_here';
// Non-blocking middleware - sets auth status but doesn't prevent access
const authMiddleware = (req, res, next) => {
    var _a;
    const authReq = req;
    const authHeader = (_a = authReq.header('Authorization')) === null || _a === void 0 ? void 0 : _a.replace('Bearer ', '');
    // Remove any 'auth_' prefixes (handles multiple prefixes)
    const token = authHeader === null || authHeader === void 0 ? void 0 : authHeader.replace(/^(auth_)+/, '');
    if (!token) {
        authReq.isAuthenticated = false;
        return next();
    }
    try {
        const decoded = jsonwebtoken_1.default.verify(token, JWT_SECRET);
        authReq.userId = decoded.userId;
        authReq.username = decoded.username;
        authReq.isAuthenticated = !decoded.isTemporary;
        next();
    }
    catch (error) {
        console.error('Auth Middleware - Token verification error:', error);
        authReq.isAuthenticated = false;
        next();
    }
};
exports.authMiddleware = authMiddleware;
// Blocking middleware for protected routes
const requireAuth = (req, res, next) => {
    const authReq = req;
    if (!authReq.isAuthenticated) {
        return res.status(401).json({ error: 'Authentication required' });
    }
    next();
};
exports.requireAuth = requireAuth;

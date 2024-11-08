import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret_here';

export interface AuthRequest extends Request {
    userId?: string;
    username?: string;
    isAuthenticated: boolean;
}

// Non-blocking middleware - sets auth status but doesn't prevent access
export const authMiddleware = (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    const authReq = req as AuthRequest;
    const authHeader = authReq.header('Authorization')?.replace('Bearer ', '');

    console.log('Auth Middleware - Raw auth header:', authHeader);

    // Remove any 'auth_' prefixes (handles multiple prefixes)
    const token = authHeader?.replace(/^(auth_)+/, '');

    console.log('Auth Middleware - Processed token:', token);

    if (!token) {
        console.log('Auth Middleware - No token provided');
        authReq.isAuthenticated = false;
        return next();
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET) as {
            userId?: string;
            username?: string;
            isTemporary?: boolean
        };
        console.log('Auth Middleware - Decoded token:', decoded);

        authReq.userId = decoded.userId;
        authReq.username = decoded.username;
        authReq.isAuthenticated = !decoded.isTemporary;

        console.log('Auth Middleware - User details:', {
            userId: authReq.userId,
            username: authReq.username,
            isAuthenticated: authReq.isAuthenticated
        });

        next();
    } catch (error) {
        console.error('Auth Middleware - Token verification error:', error);
        authReq.isAuthenticated = false;
        next();
    }
};

// Blocking middleware for protected routes
export const requireAuth = (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    const authReq = req as AuthRequest;
    if (!authReq.isAuthenticated) {
        return res.status(401).json({ error: 'Authentication required' });
    }
    next();
};

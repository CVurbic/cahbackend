import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

interface AdminAuthRequest extends Request {
    admin?: {
        id: string;
        isAdmin: boolean;
    };
}

export const adminAuthMiddleware = (req: AdminAuthRequest, res: Response, next: NextFunction) => {
    const token = req.headers.authorization?.split(' ')[1];

    if (!token) {
        return res.status(401).json({ message: 'No token provided' });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET!) as { id: string; isAdmin: boolean };
        
        if (!decoded.isAdmin) {
            return res.status(403).json({ message: 'Not authorized as admin' });
        }

        req.admin = decoded;
        next();
    } catch (error) {
        res.status(401).json({ message: 'Invalid token' });
    }
}; 
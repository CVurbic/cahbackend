import { Request, Response } from 'express';
import Admin from '../models/Admin';
import jwt from 'jsonwebtoken';

export const loginAdmin = async (req: Request, res: Response) => {
    try {
        console.log('Login request received');
        const { username, password } = req.body;

        console.log('Username:', username);
        console.log('Password:', password);

        const admin = await Admin.findOne({ username });
        if (!admin) {
            return res.status(401).json({ message: 'Invalid credentials' });
        }

        const isMatch = await admin.comparePassword(password);
        if (!isMatch) {
            return res.status(401).json({ message: 'Invalid credentials' });
        }

        const token = jwt.sign(
            { id: admin._id, isAdmin: true },
            process.env.JWT_SECRET as string,
            { expiresIn: '24h' }
        );

        res.json({ token });
    } catch (error) {
        console.error('Admin login error:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

// Optional: Create initial admin account
export const createInitialAdmin = async () => {
    try {
        console.log('Checking for existing admin account...');
        const adminExists = await Admin.findOne({ username: 'chris' });
        
        if (!adminExists) {
            console.log('No admin account found. Creating initial admin account...');
            const newAdmin = new Admin({
                username: 'chris',
                password: '123456789'
            });
            
            await newAdmin.save();
            console.log('Initial admin account created successfully');
        } else {
            console.log('Admin account already exists');
        }
    } catch (error) {
        console.error('Error in createInitialAdmin:', error);
        throw error; // Propagate the error
    }
}; 
import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import User from '../models/User';

const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret_here';

export const signup = async (req: Request, res: Response) => {
    try {
        const { username, email, password } = req.body;

        // Check if user already exists
        const existingUser = await User.findOne({ $or: [{ email }, { username }] });
        if (existingUser) {
            return res.status(400).json({ message: 'User already exists' });
        }

        // Hash password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        // Create new user
        const newUser = new User({
            username,
            email,
            password: hashedPassword,
        });

        await newUser.save();

        // Create and send JWT token
        const token = jwt.sign({ userId: newUser._id }, JWT_SECRET, { expiresIn: '1d' });

        res.status(201).json({ token, userId: newUser._id });
    } catch (error) {
        console.error('Signup error:', error);
        res.status(500).json({ message: 'Error signing up' });
    }
};

export const login = async (req: Request, res: Response) => {
    try {
        const { username, password } = req.body;

        // Find user by username
        const user = await User.findOne({ username });
        if (!user) {
            return res.status(400).json({ message: 'Invalid credentials' });
        }

        // Check password
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({ message: 'Invalid credentials' });
        }

        // Create token with the same secret
        const token = jwt.sign(
            { userId: user._id, username: user.username },
            JWT_SECRET,
            { expiresIn: '1d' }
        );

        res.json({ token: `auth_${token}`, userId: user._id });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ message: 'Error logging in' });
    }
};



export const joinWithoutSignup = async (req: Request, res: Response) => {
    try {
        const { username } = req.body;

        if (!username) {
            return res.status(400).json({ message: 'Username is required' });
        }

        // Generate a temporary token
        const token = jwt.sign({ username, isTemporary: true }, JWT_SECRET, { expiresIn: '1d' });

        res.status(200).json({ token, username });
    } catch (error) {
        console.error('Join without signup error:', error);
        res.status(500).json({ message: 'Error joining without signup' });
    }
};

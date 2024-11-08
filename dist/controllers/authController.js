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
exports.joinWithoutSignup = exports.login = exports.signup = void 0;
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const User_1 = __importDefault(require("../models/User"));
const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret';
const signup = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { username, email, password } = req.body;
        // Check if user already exists
        const existingUser = yield User_1.default.findOne({ $or: [{ email }, { username }] });
        if (existingUser) {
            return res.status(400).json({ message: 'User already exists' });
        }
        // Hash password
        const salt = yield bcryptjs_1.default.genSalt(10);
        const hashedPassword = yield bcryptjs_1.default.hash(password, salt);
        // Create new user
        const newUser = new User_1.default({
            username,
            email,
            password: hashedPassword,
        });
        yield newUser.save();
        // Create and send JWT token
        const token = jsonwebtoken_1.default.sign({ userId: newUser._id }, JWT_SECRET, { expiresIn: '1d' });
        res.status(201).json({ token, userId: newUser._id });
    }
    catch (error) {
        console.error('Signup error:', error);
        res.status(500).json({ message: 'Error signing up' });
    }
});
exports.signup = signup;
const login = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { username, password } = req.body;
        // Find user by username
        const user = yield User_1.default.findOne({ username });
        if (!user) {
            return res.status(400).json({ message: 'Invalid credentials' });
        }
        // Check password
        const isMatch = yield bcryptjs_1.default.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({ message: 'Invalid credentials' });
        }
        // Create and send JWT token
        const token = jsonwebtoken_1.default.sign({ userId: user._id }, JWT_SECRET, { expiresIn: '1d' });
        res.json({ token, userId: user._id });
    }
    catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ message: 'Error logging in' });
    }
});
exports.login = login;
const joinWithoutSignup = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { username } = req.body;
        if (!username) {
            return res.status(400).json({ message: 'Username is required' });
        }
        // Generate a temporary token
        const token = jsonwebtoken_1.default.sign({ username, isTemporary: true }, JWT_SECRET, { expiresIn: '1d' });
        res.status(200).json({ token, username });
    }
    catch (error) {
        console.error('Join without signup error:', error);
        res.status(500).json({ message: 'Error joining without signup' });
    }
});
exports.joinWithoutSignup = joinWithoutSignup;

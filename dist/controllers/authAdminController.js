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
exports.createInitialAdmin = exports.loginAdmin = void 0;
const Admin_1 = __importDefault(require("../models/Admin"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const loginAdmin = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        console.log('Login request received');
        const { username, password } = req.body;
        console.log('Username:', username);
        console.log('Password:', password);
        const admin = yield Admin_1.default.findOne({ username });
        if (!admin) {
            return res.status(401).json({ message: 'Invalid credentials' });
        }
        const isMatch = yield admin.comparePassword(password);
        if (!isMatch) {
            return res.status(401).json({ message: 'Invalid credentials' });
        }
        const token = jsonwebtoken_1.default.sign({ id: admin._id, isAdmin: true }, process.env.JWT_SECRET, { expiresIn: '24h' });
        res.json({ token });
    }
    catch (error) {
        console.error('Admin login error:', error);
        res.status(500).json({ message: 'Server error' });
    }
});
exports.loginAdmin = loginAdmin;
// Optional: Create initial admin account
const createInitialAdmin = () => __awaiter(void 0, void 0, void 0, function* () {
    try {
        console.log('Checking for existing admin account...');
        const adminExists = yield Admin_1.default.findOne({ username: 'chris' });
        if (!adminExists) {
            console.log('No admin account found. Creating initial admin account...');
            const newAdmin = new Admin_1.default({
                username: 'chris',
                password: '123456789'
            });
            yield newAdmin.save();
            console.log('Initial admin account created successfully');
        }
        else {
            console.log('Admin account already exists');
        }
    }
    catch (error) {
        console.error('Error in createInitialAdmin:', error);
        throw error; // Propagate the error
    }
});
exports.createInitialAdmin = createInitialAdmin;

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
exports.io = void 0;
const express_1 = __importDefault(require("express"));
const http_1 = __importDefault(require("http"));
const socket_io_1 = require("socket.io");
const cors_1 = __importDefault(require("cors"));
const mongoose_1 = __importDefault(require("mongoose"));
const gameRoutes_1 = __importDefault(require("./routes/gameRoutes"));
const gameController_1 = require("./controllers/gameController");
const dotenv_1 = __importDefault(require("dotenv"));
const body_parser_1 = __importDefault(require("body-parser"));
const authRoutes_1 = __importDefault(require("./routes/authRoutes"));
dotenv_1.default.config();
const app = (0, express_1.default)();
const server = http_1.default.createServer(app);
// Enable CORS for all routes
app.use((0, cors_1.default)());
const io = new socket_io_1.Server(server, {
    cors: {
        origin: process.env.PUBLIC_URL,
        methods: ["GET", "POST"]
    }
});
exports.io = io;
// Set up middleware, routes, etc.
app.use(express_1.default.json());
app.use(body_parser_1.default.json({ limit: '1mb' }));
app.use(body_parser_1.default.urlencoded({ limit: '1mb', extended: true }));
app.use('/api/auth', authRoutes_1.default);
app.use('/api/game', gameRoutes_1.default);
// Pass io to the game controller
(0, gameController_1.setIo)(io);
// Connect to MongoDB
mongoose_1.default.connect(process.env.MONGO_URI)
    .then(() => console.log('Connected to MongoDB'))
    .catch((err) => {
    console.error('MongoDB connection error:', err);
    process.exit(1); // Exit the process if unable to connect to MongoDB
});
// Global online users
let onlineUsers = {};
// Socket.IO connection handling
io.on('connection', (socket) => {
    console.log('A user connected');
    socket.on('userOnline', (username) => {
        onlineUsers[socket.id] = username;
        console.log(`User ${username} is now online`);
        io.emit('onlineUsersUpdate', Object.values(onlineUsers));
    });
    socket.on('joinGame', (gameId) => {
        socket.join(gameId);
        console.log(`User joined game: ${gameId}`);
    });
    // Add this handler for chat messages
    socket.on('chat message', (message) => __awaiter(void 0, void 0, void 0, function* () {
        console.log(`Chat message received: ${message.content}`);
        if (message.gameId) {
            try {
                yield (0, gameController_1.addChatMessage)(message.gameId, message.sender, message.content, message.isSystemMessage || false);
            }
            catch (error) {
                console.error('Error saving chat message:', error);
            }
        }
        else {
            // Handle lobby-wide messages if needed
            io.emit('chat message', message);
        }
    }));
    socket.on('disconnect', () => {
        const username = onlineUsers[socket.id];
        delete onlineUsers[socket.id];
        console.log(`User ${username} disconnected`);
        io.emit('onlineUsersUpdate', Object.values(onlineUsers));
    });
});
// Add a new route to get online users
app.get('/api/online-users', (req, res) => {
    res.json({ onlineUsers: Object.values(onlineUsers) });
});
// Add this test route
app.get('/api/test', (req, res) => {
    res.json({ message: 'Server is running' });
});
// Add this middleware to log all requests
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
    next();
});
// Add this catch-all route at the end
app.use((req, res) => {
    console.log(`Unhandled request: ${req.method} ${req.path}`);
    res.status(404).json({ message: 'Route not found' });
});
// Add this error handling middleware after all your routes
app.use((err, req, res, next) => {
    if (err instanceof SyntaxError && 'body' in err) {
        return res.status(400).json({ message: 'Invalid JSON' });
    }
    if (err.type === 'entity.too.large') {
        return res.status(413).json({
            message: 'Payload too large',
            details: 'The message you\'re trying to send is too large. Please try a shorter message.'
        });
    }
    // For any other errors, pass it to the default Express error handler
    next(err);
});
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

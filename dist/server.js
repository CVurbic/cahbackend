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
const notificationController_1 = require("./controllers/notificationController");
const notificationRoutes_1 = __importDefault(require("./routes/notificationRoutes"));
const imageRoutes_1 = __importDefault(require("./routes/imageRoutes"));
const path_1 = __importDefault(require("path"));
const Game_1 = __importDefault(require("./models/Game"));
const adminAuthRoutes_1 = __importDefault(require("./routes/adminAuthRoutes"));
const authAdminController_1 = require("./controllers/authAdminController");
const adminRoutes_1 = __importDefault(require("./routes/adminRoutes"));
dotenv_1.default.config();
const app = (0, express_1.default)();
const server = http_1.default.createServer(app);
// Enable CORS for all routes
app.use((0, cors_1.default)());
console.log(process.env.PUBLIC_URL);
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
app.use('/api/notifications', notificationRoutes_1.default);
app.use('/api/images', imageRoutes_1.default);
app.use('/api/admin/auth', adminAuthRoutes_1.default);
app.use('/api/admin', adminRoutes_1.default);
// Serve static files from uploads directory
app.use('/uploads', express_1.default.static(path_1.default.join(__dirname, 'uploads')));
// Pass io to the game controller
(0, gameController_1.setIo)(io);
// Connect to MongoDB
mongoose_1.default.connect(process.env.MONGO_URI)
    .then(() => __awaiter(void 0, void 0, void 0, function* () {
    console.log('Connected to MongoDB');
    yield (0, authAdminController_1.createInitialAdmin)();
    console.log('Initial admin setup complete');
}))
    .catch((err) => {
    console.error('MongoDB connection error:', err);
    process.exit(1);
});
// Global online users
let onlineUsers = {};
let userSocketMap = {};
// Add a function to clean up stale users
const cleanupStaleUsers = () => {
    const now = Date.now();
    const staleTimeout = 30000; // Increase to 30 seconds
    const staleUsers = Object.entries(onlineUsers).filter(([_, user]) => {
        return now - user.timestamp > staleTimeout;
    });
    let hasRemovedUsers = false;
    staleUsers.forEach(([socketId, user]) => {
        console.log(`Removing stale user: ${user.username}`);
        delete onlineUsers[socketId];
        hasRemovedUsers = true;
    });
    // Only emit if we actually removed users
    if (hasRemovedUsers) {
        emitOnlineUsers();
    }
};
const emitOnlineUsers = () => {
    const onlineUsernames = Object.values(onlineUsers).map(user => user.username);
    console.log('Emitting online users update:', onlineUsernames);
    io.emit('onlineUsersUpdate', onlineUsernames);
};
// Socket.IO connection handling
io.on('connection', (socket) => {
    console.log('A user connected');
    // Keep track of joined games to prevent duplicates
    const joinedGames = new Set();
    socket.on('userOnline', (data) => {
        let username;
        console.log('Raw userOnline data:', data);
        // Handle different data formats
        if (typeof data === 'string') {
            username = data;
        }
        else if (typeof data === 'object' && data !== null && 'username' in data) {
            username = data.username;
        }
        else {
            console.error('Invalid data format for userOnline event:', data);
            return;
        }
        // Update or add user with timestamp
        onlineUsers[socket.id] = {
            username: username,
            socketId: socket.id,
            timestamp: Date.now()
        };
        // Update userSocketMap with normalized username
        const normalizedUsername = username.toLowerCase();
        userSocketMap[normalizedUsername] = {
            username: username,
            socketId: socket.id,
            playerId: socket.id // You might want to use a different ID here if you have one
        };
        console.log('User online:', username);
        console.log('Current online users:', onlineUsers);
        console.log('Current userSocketMap:', userSocketMap);
        emitOnlineUsers();
    });
    socket.on('joinGame', (gameId) => {
        // Only join if not already in the game
        if (!joinedGames.has(gameId)) {
            socket.join(gameId);
            joinedGames.add(gameId);
            console.log(`User joined game: ${gameId}`);
        }
        else {
            console.log(`User already in game: ${gameId}`);
        }
    });
    socket.on('chat message', (messageData) => __awaiter(void 0, void 0, void 0, function* () {
        const messageId = new mongoose_1.default.Types.ObjectId().toString();
        const message = Object.assign(Object.assign({ id: messageId }, messageData), { timestamp: new Date() });
        try {
            if (message.gameId) {
                // Save to database
                yield Game_1.default.findByIdAndUpdate(message.gameId, {
                    $push: {
                        chatMessages: {
                            _id: messageId,
                            sender: message.sender,
                            content: message.content,
                            timestamp: message.timestamp,
                            gameId: message.gameId
                        }
                    }
                });
                // Emit only to the specific game room
                io.to(message.gameId).emit('chat message', message);
            }
            else {
                // Emit to all users if no gameId (global chat)
                io.emit('chat message', message);
            }
        }
        catch (error) {
            console.error('Error handling chat message:', error);
            socket.emit('chat error', { message: 'Failed to send message' });
        }
    }));
    socket.on('disconnect', () => {
        if (onlineUsers[socket.id]) {
            const username = onlineUsers[socket.id].username;
            console.log('User disconnected:', username);
            delete onlineUsers[socket.id];
            delete userSocketMap[username.toLowerCase()];
            emitOnlineUsers();
        }
    });
    socket.on('invitePlayer', (data) => __awaiter(void 0, void 0, void 0, function* () {
        console.log(`Invite player event received:`, JSON.stringify(data, null, 2));
        const normalizedPlayerName = data.playerName.toLowerCase();
        const targetUser = userSocketMap[normalizedPlayerName];
        if (targetUser) {
            const inviteData = {
                id: Math.random().toString(36).substr(2, 9),
                from: data.inviterName,
                gameId: data.gameId,
                playerId: targetUser.playerId,
                time: new Date()
            };
            try {
                // Save notification to database
                yield (0, notificationController_1.createNotification)(targetUser.playerId, targetUser.username, 'gameInvite', inviteData);
                // Emit to connected socket
                io.to(targetUser.socketId).emit('gameInvite', inviteData);
            }
            catch (error) {
                console.error('Error saving notification:', error);
            }
        }
    }));
    socket.on('acceptGameInvite', (data) => {
        console.log(`Accept game invite event received:`, JSON.stringify(data, null, 2));
        // Only join if not already in the game
        if (!joinedGames.has(data.gameId)) {
            socket.join(data.gameId);
            joinedGames.add(data.gameId);
            console.log(`Socket ${socket.id} joined game room ${data.gameId}`);
            const playerJoinedData = {
                username: onlineUsers[socket.id],
                gameId: data.gameId
            };
            console.log(`Emitting playerJoined event to game ${data.gameId}:`, JSON.stringify(playerJoinedData, null, 2));
            io.to(data.gameId).emit('playerJoined', playerJoinedData);
        }
        else {
            console.log(`User already in game: ${data.gameId}`);
        }
    });
    socket.on('declineGameInvite', (data) => {
        console.log(`Decline game invite event received:`, JSON.stringify(data, null, 2));
        console.log(`User ${onlineUsers[socket.id]} declined game invite ${data.inviteId}`);
        // Add any additional logic for handling declined invites here
    });
    // Add heartbeat handler
    socket.on('heartbeat', (username) => {
        if (onlineUsers[socket.id]) {
            onlineUsers[socket.id].timestamp = Date.now();
        }
        else {
            // Re-add user if they're missing
            onlineUsers[socket.id] = {
                username: username,
                socketId: socket.id,
                timestamp: Date.now()
            };
            emitOnlineUsers();
        }
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
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    console.log('Headers:', req.headers);
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
// Set up periodic cleanup
setInterval(cleanupStaleUsers, 15000); // Check every 15 seconds
// Create initial admin account when server starts
(0, authAdminController_1.createInitialAdmin)();
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

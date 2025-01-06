import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import mongoose from 'mongoose';
import gameRoutes from './routes/gameRoutes';
import { setIo, addChatMessage } from './controllers/gameController';
import dotenv from 'dotenv';
import bodyParser from 'body-parser';
import authRoutes from './routes/authRoutes';
import { createNotification } from './controllers/notificationController';
import notificationRoutes from './routes/notificationRoutes';
import imageRoutes from './routes/imageRoutes';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import Game, { IChatMessage } from './models/Game';
import adminAuthRoutes from './routes/adminAuthRoutes';
import { createInitialAdmin } from './controllers/authAdminController';
import adminRoutes from './routes/adminRoutes';
import { ChatMessage } from './types/game';

dotenv.config();
const app = express();
const server = http.createServer(app);


// Enable CORS for all routes
app.use(cors());
console.log(process.env.PUBLIC_URL);
const io = new Server(server, {
    cors: {
        origin: process.env.PUBLIC_URL,
        methods: ["GET", "POST"]
    }
});

// Set up middleware, routes, etc.
app.use(express.json());
app.use(bodyParser.json({ limit: '1mb' }));
app.use(bodyParser.urlencoded({ limit: '1mb', extended: true }));
app.use('/api/auth', authRoutes);
app.use('/api/game', gameRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/images', imageRoutes);
app.use('/api/admin/auth', adminAuthRoutes);
app.use('/api/admin', adminRoutes);

// Serve static files from uploads directory
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Pass io to the game controller
setIo(io);

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URI as string)
    .then(async () => {
        console.log('Connected to MongoDB');
        await createInitialAdmin();
        console.log('Initial admin setup complete');
    })
    .catch((err) => {
        console.error('MongoDB connection error:', err);
        process.exit(1);
    });

// Global online users
let onlineUsers: { [socketId: string]: OnlineUser } = {};
let userSocketMap: { [username: string]: UserInfo } = {};

// Track both username and ID
interface UserInfo {
    username: string;
    socketId: string;
    playerId: string;
}

// Add this interface at the top with other interfaces
interface OnlineUser {
    username: string;
    socketId: string;
    timestamp: number;
}

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

// Keep track of recent messages per game
const gameMessages: { [gameId: string]: ChatMessage[] } = {};

// Socket.IO connection handling
io.on('connection', (socket) => {
    console.log('A user connected');

    // Keep track of joined games to prevent duplicates
    const joinedGames = new Set();

    socket.on('userOnline', (data) => {
        let username: string;
        console.log('Raw userOnline data:', data);

        // Handle different data formats
        if (typeof data === 'string') {
            username = data;
        } else if (typeof data === 'object' && data !== null && 'username' in data) {
            username = data.username;
        } else {
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
        } else {
            console.log(`User already in game: ${gameId}`);
        }
    });

    socket.on('chat message', async (messageData: any) => {
        console.log('chat message received:', messageData);
        try {
            const game = await Game.findById(messageData.gameId);
            if (!game) {
                console.error('Game not found for chat message:', messageData.gameId);
                return;
            }

            const chatMessage: IChatMessage = {
                _id: messageData._id || new mongoose.Types.ObjectId().toString(),
                sender: messageData.sender,
                content: messageData.content,
                timestamp: new Date(messageData.timestamp),
                isSystemMessage: messageData.isSystemMessage,
                gameId: messageData.gameId,
                status: 'sent'
            };

            // Update game with new message
            await Game.findByIdAndUpdate(
                messageData.gameId,
                {
                    $push: { chatMessages: chatMessage }
                },
                { new: true }
            );

            // Keep the same format as received from client
            const clientMessage = {
                _id: chatMessage._id,
                content: chatMessage.content,
                sender: chatMessage.sender,
                username: chatMessage.sender,
                timestamp: chatMessage.timestamp,
                gameId: chatMessage.gameId,
                isSystemMessage: chatMessage.isSystemMessage
            };

            console.log("emiting chat message: to game", messageData.gameId);
            console.log("emiting chat message:", clientMessage);
            console.log("emmiting with message chat message")
            // Emit to the specific game room
            io.to(messageData.gameId).emit('chat message', clientMessage);

        } catch (error) {
            console.error('Error handling chat message:', error);
            socket.emit('chat error', { message: 'Failed to send message' });
        }
    });

    socket.on('request_recent_messages', async ({ gameId }) => {
        try {
            const game = await Game.findById(gameId);
            if (game && game.chatMessages) {
                // Convert MongoDB messages to client format
                const messages = game.chatMessages.map(msg => ({
                    _id: msg._id,
                    text: msg.content,
                    sender: msg.sender,
                    username: msg.sender,
                    timestamp: msg.timestamp,
                    gameId: msg.gameId,
                    isSystemMessage: msg.isSystemMessage
                }));
                socket.emit('recent_messages', messages);
            } else {
                socket.emit('recent_messages', []);
            }
        } catch (error) {
            console.error('Error fetching recent messages:', error);
            socket.emit('recent_messages', []);
        }
    });

    socket.on('disconnect', () => {
        if (onlineUsers[socket.id]) {
            const username = onlineUsers[socket.id].username;
            console.log('User disconnected:', username);
            delete onlineUsers[socket.id];
            delete userSocketMap[username.toLowerCase()];
            emitOnlineUsers();
        }
    });

    socket.on('invitePlayer', async (data: {
        gameId: string,
        playerName: string,
        inviterName: string
    }) => {
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
                await createNotification(targetUser.playerId, targetUser.username, 'gameInvite', inviteData);

                // Emit to connected socket
                io.to(targetUser.socketId).emit('gameInvite', inviteData);
            } catch (error) {
                console.error('Error saving notification:', error);
            }
        }
    });

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
        } else {
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
        } else {
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
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
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
createInitialAdmin();

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

export { io };

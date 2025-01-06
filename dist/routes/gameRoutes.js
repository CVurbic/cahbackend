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
const express_1 = __importDefault(require("express"));
const auth_1 = require("../middleware/auth");
const gameController_1 = require("../controllers/gameController");
const router = express_1.default.Router();
// Apply authMiddleware to all game routes or specific routes as needed
router.use(auth_1.authMiddleware);
console.log('Registering /current-players route');
router.get('/current-players', gameController_1.getCurrentPlayers);
router.get('/available-packs', gameController_1.getAvailablePacks);
router.post('/create', gameController_1.createGame);
router.get('/:gameId', gameController_1.getGameState);
router.post('/:gameId/join', gameController_1.joinGame);
router.post('/:gameId/start', gameController_1.startGame);
router.post('/:gameId/play-card', gameController_1.playCard);
router.post('/:gameId/select-winner', gameController_1.selectWinner);
router.post('/:gameId/rejoin', gameController_1.rejoinGame);
router.post('/:gameId/leave', gameController_1.leaveGame);
router.post('/:gameId/restart', gameController_1.restartGame);
router.post('/:gameId/reveal-card', gameController_1.revealCard);
router.delete('/:gameId/delete', gameController_1.deleteGame);
router.post('/:gameId/online-status', gameController_1.updateOnlineStatus);
router.get('/:gameId/online-users', gameController_1.getOnlineUsers);
router.post('/:gameId/chat', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { gameId } = req.params;
        const { sender, content, isSystemMessage } = req.body;
        const newMessage = yield (0, gameController_1.addChatMessage)(gameId, sender, content, isSystemMessage);
        res.status(200).json({ message: 'Chat message added successfully', chatMessage: newMessage });
    }
    catch (error) {
        console.error('Error adding chat message:', error);
        res.status(500).json({ message: 'Error adding chat message', error: error.message });
    }
}));
router.get('/:gameId/older-messages', gameController_1.getOlderMessages);
// Card management routes
router.post('/cards', gameController_1.createCard);
router.put('/cards/:cardId', gameController_1.editCard);
router.delete('/cards/:cardId', gameController_1.deleteCard);
// Pack management routes
router.post('/packs', auth_1.authMiddleware, gameController_1.createPack);
router.put('/packs/:packId', gameController_1.editPack);
router.delete('/packs/:packId', gameController_1.deletePack);
router.get('/packs', gameController_1.getCardPacks);
router.get('/packs/:packId/cards', gameController_1.getPackCards);
router.post('/packs/:packId/rate', gameController_1.rateCardPack);
router.get('/packs/sorted', gameController_1.getSortedPacks);
// Add new authenticated-only route
router.get('/player-stats', gameController_1.getPlayerStats);
router.get('/:gameId/messages-since/:timestamp', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { gameId, timestamp } = req.params;
        if (!gameId) {
            return res.status(400).json({ message: 'Game ID is required' });
        }
        // const messages = await getMessagesSince(gameId, new Date(timestamp));
        res.status(200).json({ messages: [] });
    }
    catch (error) {
        // console.error('Error fetching messages since timestamp:', error);
        res.status(500).json({ message: 'Error fetching messages', error: error.message });
    }
}));
router.get("/admin/");
router.post('/:gameId/initiate-vote', gameController_1.initiateVote);
router.post('/:gameId/submit-vote', gameController_1.submitVote);
router.post('/:gameId/select-cards', gameController_1.selectCardsToChange);
exports.default = router;

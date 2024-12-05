import express from 'express';
import { authMiddleware } from '../middleware/auth';
import {
    restartGame,
    createGame,
    joinGame,
    leaveGame,
    startGame,
    playCard,
    selectWinner,
    getGameState,
    rejoinGame,
    getCurrentPlayers,
    revealCard,
    deleteGame,
    getAvailablePacks,
    updateOnlineStatus,
    getOnlineUsers,
    addChatMessage,
    getOlderMessages,
    createCard,
    editCard,
    deleteCard,
    createPack,
    editPack,
    deletePack,
    getCardPacks,
    getPackCards,
    getPlayerStats,
    rateCardPack,
    getSortedPacks,
    // getMessagesSince,
    initiateVote,
    submitVote,
    selectCardsToChange,
} from '../controllers/gameController';

const router = express.Router();

// Apply authMiddleware to all game routes or specific routes as needed
router.use(authMiddleware as any);

console.log('Registering /current-players route');

router.get('/current-players', getCurrentPlayers);
router.get('/available-packs', getAvailablePacks);

router.post('/create', createGame);
router.get('/:gameId', getGameState);
router.post('/:gameId/join', joinGame);
router.post('/:gameId/start', startGame);
router.post('/:gameId/play-card', playCard);
router.post('/:gameId/select-winner', selectWinner);
router.post('/:gameId/rejoin', rejoinGame);
router.post('/:gameId/leave', leaveGame);
router.post('/:gameId/restart', restartGame);
router.post('/:gameId/reveal-card', revealCard);

router.delete('/:gameId/delete', deleteGame);

router.post('/:gameId/online-status', updateOnlineStatus);
router.get('/:gameId/online-users', getOnlineUsers);

router.post('/:gameId/chat', async (req, res) => {
    try {
        const { gameId } = req.params;
        const { sender, content, isSystemMessage } = req.body;
        const newMessage = await addChatMessage(gameId, sender, content, isSystemMessage);
        res.status(200).json({ message: 'Chat message added successfully', chatMessage: newMessage });
    } catch (error: any) {
        console.error('Error adding chat message:', error);
        res.status(500).json({ message: 'Error adding chat message', error: error.message });
    }
});

router.get('/:gameId/older-messages', getOlderMessages);

// Card management routes
router.post('/cards', createCard);
router.put('/cards/:cardId', editCard);
router.delete('/cards/:cardId', deleteCard);

// Pack management routes
router.post('/packs', authMiddleware, createPack);
router.put('/packs/:packId', editPack);
router.delete('/packs/:packId', deletePack);
router.get('/packs', getCardPacks);
router.get('/packs/:packId/cards', getPackCards);
router.post('/packs/:packId/rate', rateCardPack);
router.get('/packs/sorted', getSortedPacks);

// Add new authenticated-only route
router.get('/player-stats', getPlayerStats);

router.get('/:gameId/messages-since/:timestamp', async (req, res) => {
    try {
        const { gameId, timestamp } = req.params;
        if (!gameId) {
            return res.status(400).json({ message: 'Game ID is required' });
        }
        // const messages = await getMessagesSince(gameId, new Date(timestamp));
        res.status(200).json({ messages: [] });
    } catch (error: any) {
        // console.error('Error fetching messages since timestamp:', error);
        res.status(500).json({ message: 'Error fetching messages', error: error.message });
    }
});

router.get("/admin/")

router.post('/:gameId/initiate-vote', initiateVote);
router.post('/:gameId/submit-vote', submitVote);
router.post('/:gameId/select-cards', selectCardsToChange);

export default router;

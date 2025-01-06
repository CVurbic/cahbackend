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
exports.selectCardsToChange = exports.submitVote = exports.initiateVote = exports.getSortedPacks = exports.rateCardPack = exports.updatePackUsageAndRating = exports.getPlayerStats = exports.getPackCards = exports.getCardPacks = exports.deletePack = exports.editPack = exports.createPack = exports.deleteCard = exports.editCard = exports.createCard = exports.getOlderMessages = exports.addChatMessage = exports.getOnlineUsers = exports.updateOnlineStatus = exports.getAvailablePacks = exports.deleteFinishedInactiveGames = exports.deleteGame = exports.revealCard = exports.getCurrentPlayers = exports.rejoinGame = exports.selectWinner = exports.playCard = exports.restartGame = exports.startGame = exports.getGameState = exports.leaveGame = exports.joinGame = exports.createGame = exports.setIo = void 0;
const Game_1 = __importDefault(require("../models/Game"));
const uuid_1 = require("uuid");
const cardDecks_1 = require("../utils/cardDecks");
const helpers_1 = require("../utils/helpers");
const node_cron_1 = __importDefault(require("node-cron"));
const botPlayer_1 = require("../utils/botPlayer");
const openai_1 = __importDefault(require("openai"));
const dotenv_1 = __importDefault(require("dotenv"));
const Card_1 = require("../models/Card");
const helpers_2 = require("../utils/helpers");
const mongoose_1 = __importDefault(require("mongoose"));
dotenv_1.default.config();
const openai = new openai_1.default({
    apiKey: process.env.OPENAI_API_KEY,
});
let io;
// Add this helper function at the top of the file
function transformMongoDocument(doc) {
    const transformed = doc.toObject();
    transformed.id = transformed._id;
    delete transformed._id;
    return transformed;
}
const setIo = (socketIo) => {
    io = socketIo;
};
exports.setIo = setIo;
const createGame = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const creatorId = req.userId || (0, uuid_1.v4)();
        const creatorName = req.username || req.body.playerName;
        const gameId = (0, uuid_1.v4)().substring(0, 6);
        const gameName = req.body.gameName;
        const winningScore = req.body.winningScore;
        const selectedBlackCardPacks = req.body.blackCardPacks;
        const selectedWhiteCardPacks = req.body.whiteCardPacks;
        // Extract just the pack IDs from the request
        const selectedBlackCardPacksIDs = selectedBlackCardPacks.map((pack) => pack.id || pack);
        const selectedWhiteCardPacksIDs = selectedWhiteCardPacks.map((pack) => pack.id || pack);
        const createdAt = new Date();
        console.log('Creating new game with the following settings:');
        console.log(`Game Name: ${gameName}`);
        console.log(`Creator Name: ${creatorName}`);
        console.log('Selected Black Card Packs:', selectedBlackCardPacksIDs);
        console.log('Selected White Card Packs:', selectedWhiteCardPacksIDs);
        // Fetch cards from MongoDB using pack IDs
        const blackCards = yield (0, cardDecks_1.getCardsFromPacks)(selectedBlackCardPacksIDs, 'black');
        const whiteCards = yield (0, cardDecks_1.getCardsFromPacks)(selectedWhiteCardPacksIDs, 'white');
        if (!blackCards.length || !whiteCards.length) {
            return res.status(400).json({
                message: 'Unable to create game: No cards available from selected packs'
            });
        }
        const newGame = new Game_1.default({
            _id: gameId,
            gameName,
            creatorId,
            players: [{
                    id: creatorId,
                    name: creatorName,
                    hand: [],
                    score: 0
                }],
            currentBlackCard: null,
            cardCzar: null,
            round: 0,
            phase: 'lobby',
            winner: null,
            blackCards: (0, helpers_1.shuffleArray)(blackCards),
            whiteCards: (0, helpers_1.shuffleArray)(whiteCards),
            dealtWhiteCards: [],
            playedCards: {},
            winningScore,
            selectedBlackCardPacks: req.body.blackCardPacks,
            selectedWhiteCardPacks: req.body.whiteCardPacks,
            selectedBlackCardPacksIDs: selectedBlackCardPacksIDs,
            selectedWhiteCardPacksIDs: selectedWhiteCardPacksIDs,
            createdAt: createdAt,
            onlineUsers: []
        });
        console.log('New game created with:');
        console.log(`${newGame.blackCards.length} black cards`);
        console.log(`${newGame.whiteCards.length} white cards`);
        // Add bot players
        const botCount = req.body.botCount || 0;
        for (let i = 0; i < botCount; i++) {
            const bot = (0, botPlayer_1.createBot)(`Bot ${i + 1}`);
            newGame.players.push({
                id: bot.id,
                name: bot.name,
                hand: [],
                score: 0,
                isBot: true
            });
            console.log(`Added bot ${bot.name} to game ${newGame._id}`);
        }
        yield newGame.save();
        res.status(201).json({ gameId, creatorId, playerId: creatorId, createdAt: createdAt });
    }
    catch (error) {
        console.error('Error creating game:', error);
        res.status(500).json({ message: 'Error creating game', error: error.message });
    }
});
exports.createGame = createGame;
const joinGame = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { gameId } = req.params;
        const { playerName } = req.body;
        console.log(`Attempting to join game ${gameId} with name ${playerName}`);
        const game = yield Game_1.default.findById(gameId);
        if (!game) {
            console.log(`Game ${gameId} not found`);
            return res.status(404).json({ message: 'Game not found' });
        }
        // Check for duplicate player name
        const existingPlayer = game.players.find(player => player.id === req.body.playerId);
        if (existingPlayer) {
            if (existingPlayer.name.toLowerCase() !== playerName.toLowerCase()) {
                return res.status(400).json({ message: 'Player ID already exists with a different name' });
            }
        }
        else if (game.players.some(player => player.name.toLowerCase() === playerName.toLowerCase())) {
            return res.status(400).json({ message: 'Player name already taken' });
        }
        const newPlayer = {
            id: (0, uuid_1.v4)(),
            name: playerName,
            hand: [],
            score: 0,
            isBot: false
        };
        game.players.push(newPlayer);
        game.activePlayers.push(newPlayer.id); // Add to active players
        yield game.save();
        console.log(`Player ${playerName} joined game ${gameId}`);
        res.status(200).json({ playerId: newPlayer.id, gameState: game });
    }
    catch (error) {
        console.error('Error joining game:', error);
        res.status(500).json({ message: 'Error joining game', error: error.message });
    }
});
exports.joinGame = joinGame;
const leaveGame = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { gameId } = req.params;
        const { playerId } = req.body;
        console.log(`Attempting to remove player ${playerId} from game ${gameId}`);
        const game = yield Game_1.default.findById(gameId);
        if (!game) {
            console.log(`Game ${gameId} not found`);
            return res.status(404).json({ message: 'Game not found' });
        }
        const playerIndex = game.players.findIndex(player => player.id === playerId);
        if (playerIndex === -1) {
            console.log(`Player ${playerId} not found in game ${gameId}`);
            return res.status(404).json({ message: 'Player not found in game' });
        }
        game.players.splice(playerIndex, 1);
        game.activePlayers = game.activePlayers.filter(id => id !== playerId);
        yield game.save();
        console.log(`Player ${playerId} removed from game ${gameId}`);
        res.status(200).json({ message: 'Player successfully removed from game', gameState: game });
    }
    catch (error) {
        console.error('Leave game error:', error);
        res.status(500).json({ message: 'Internal server error', error: error.message });
    }
});
exports.leaveGame = leaveGame;
const MESSAGES_PER_PAGE = 15;
const getGameState = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { gameId } = req.params;
        const { playerId } = req.query;
        const game = yield Game_1.default.findById(gameId);
        if (!game) {
            return res.status(404).json({ message: 'Game not found' });
        }
        const gameState = {
            _id: game._id,
            gameName: game.gameName,
            creatorId: game.creatorId,
            players: game.players.map(player => ({
                id: player.id,
                name: player.name,
                score: player.score,
                hand: player.id === playerId ? player.hand : []
            })),
            currentBlackCard: game.currentBlackCard,
            cardCzar: game.cardCzar,
            winningScore: game.winningScore,
            round: game.round,
            phase: game.phase,
            winner: game.winner,
            playedCards: {},
            blackCards: [],
            whiteCards: [],
            dealtWhiteCards: game.dealtWhiteCards,
            revealedCards: game.revealedCards || [],
            lastWinner: game.lastWinner,
            lastWinningCard: game.lastWinningCard,
            onlineUsers: game.onlineUsers,
            chatMessages: game.chatMessages.slice(-MESSAGES_PER_PAGE),
            selectedBlackCardPacks: game.selectedBlackCardPacks,
            selectedWhiteCardPacks: game.selectedWhiteCardPacks,
            selectedBlackCardPacksIDs: game.selectedBlackCardPacksIDs,
            selectedWhiteCardPacksIDs: game.selectedWhiteCardPacksIDs
        };
        // Handle played cards based on game phase
        if (game.phase === 'selection' || game.phase === 'roundWinner') {
            // Show all played cards
            gameState.playedCards = Object.fromEntries(game.playedCards);
        }
        else if (game.phase === 'playing') {
            // Only show which players have played, not the actual cards
            gameState.playedCards = Object.fromEntries(Array.from(game.playedCards.entries()).map(([id, cards]) => [id, cards.map(() => ({ id: '', text: 'Card Played', type: 'white', pack: 'base' }))]));
        }
        else {
            // Don't show any played cards in other phases
            gameState.playedCards = {};
        }
        res.json(gameState);
    }
    catch (error) {
        console.error('Error getting game state:', error);
        res.status(500).json({ message: 'Error getting game state', error: error.message });
    }
});
exports.getGameState = getGameState;
const startGame = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const { gameId } = req.params;
        const { creatorId } = req.body;
        console.log(`Attempting to start game ${gameId} by creator ${creatorId}`);
        const game = yield Game_1.default.findById(gameId);
        if (!game) {
            console.log(`Game ${gameId} not found`);
            return res.status(404).json({ message: 'Game not found' });
        }
        if (game.creatorId !== creatorId) {
            console.log(`Creator ID mismatch. Expected: ${game.creatorId}, Received: ${creatorId}`);
            return res.status(403).json({ message: 'Only the game creator can start the game' });
        }
        if (game.players.length < 3) {
            console.log(`Not enough players. Current count: ${game.players.length}`);
            return res.status(400).json({ message: 'Need at least 3 players to start' });
        }
        if (game.phase !== 'lobby') {
            console.log(`Game is not in lobby phase. Current phase: ${game.phase}`);
            return res.status(400).json({ message: 'Game has already started' });
        }
        // Update usage count for selected packs when game starts
        const uniquePackIds = new Set([
            ...game.selectedBlackCardPacksIDs,
            ...game.selectedWhiteCardPacksIDs
        ]);
        // First ensure all packs have numeric usageCount
        yield Card_1.CardPack.updateMany({
            _id: { $in: Array.from(uniquePackIds) },
            $or: [
                { usageCount: null },
                { usageCount: { $exists: false } }
            ]
        }, { $set: { usageCount: 0 } });
        // Then increment the usage count
        yield Card_1.CardPack.updateMany({ _id: { $in: Array.from(uniquePackIds) } }, [
            {
                $set: {
                    usageCount: { $add: ['$usageCount', 1] },
                    blackCardCount: {
                        $cond: {
                            if: { $in: ['$_id', game.selectedBlackCardPacksIDs] },
                            then: { $add: ['$blackCardCount', 1] },
                            else: '$blackCardCount'
                        }
                    },
                    whiteCardCount: {
                        $cond: {
                            if: { $in: ['$_id', game.selectedWhiteCardPacksIDs] },
                            then: { $add: ['$whiteCardCount', 1] },
                            else: '$whiteCardCount'
                        }
                    }
                }
            }
        ]);
        // Shuffle the cards
        game.blackCards = (0, helpers_1.shuffleArray)(game.blackCards);
        game.whiteCards = (0, helpers_1.shuffleArray)(game.whiteCards);
        // Initialize the game
        game.phase = 'playing';
        game.round = 1;
        // Randomly select the first Card Czar
        const randomPlayerIndex = Math.floor(Math.random() * game.players.length);
        game.cardCzar = game.players[randomPlayerIndex].id;
        console.log(`Selected Card Czar: ${game.players[randomPlayerIndex].name} (${game.cardCzar})`);
        // Deal cards to all players, including bots
        game.players.forEach(player => {
            player.hand = game.whiteCards.splice(0, 10);
            console.log(`Dealt 10 cards to ${player.name} (${player.id}), isBot: ${player.isBot}`);
        });
        // Draw a black card
        game.currentBlackCard = game.blackCards.pop() || null;
        yield game.save();
        // Emit game state to all players
        io.to(gameId).emit('gameStateUpdate', game);
        // Add this new section to handle bot plays if Card Czar is human
        const cardCzarIsHuman = !((_a = game.players.find(p => p.id === game.cardCzar)) === null || _a === void 0 ? void 0 : _a.isBot);
        if (cardCzarIsHuman) {
            // Add a small delay to ensure game state is properly initialized
            setTimeout(() => __awaiter(void 0, void 0, void 0, function* () {
                yield handleBotPlayingPhase(game);
            }), 1000);
        }
        res.status(200).json({ message: 'Game started', gameState: game });
    }
    catch (error) {
        console.error('Error starting game:', error);
        res.status(500).json({ message: 'Error starting game', error: error.message });
    }
});
exports.startGame = startGame;
const restartGame = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { gameId } = req.params;
        const { creatorId } = req.body;
        const game = yield Game_1.default.findById(gameId);
        if (!game) {
            return res.status(404).json({ message: 'Game not found' });
        }
        if (game.creatorId !== creatorId) {
            return res.status(403).json({ message: 'Only the game creator can restart the game' });
        }
        // Reset game state
        game.currentBlackCard = null;
        game.cardCzar = null;
        game.round = 0;
        game.phase = 'lobby';
        game.winner = null;
        game.playedCards = new Map();
        game.lastWinner = null;
        game.lastWinningCard = null;
        // Reshuffle and reset cards
        game.blackCards = (0, helpers_1.shuffleArray)(game.blackCards);
        game.whiteCards = (0, helpers_1.shuffleArray)(game.whiteCards);
        // Reset player scores and hands
        game.players.forEach(player => {
            player.score = 0;
            player.hand = [];
        });
        yield game.save();
        console.log(`Game ${gameId} has been restarted`);
        res.json(game);
    }
    catch (error) {
        console.error('Error restarting game:', error);
        res.status(500).json({ message: 'Error restarting game' });
    }
});
exports.restartGame = restartGame;
const rotateCardCzar = (game, winningPlayerId) => {
    var _a;
    const currentCzarIndex = game.players.findIndex(player => player.id === game.cardCzar);
    game.cardCzar = winningPlayerId;
    console.log(`New Card Czar: ${(_a = game.players.find(player => player.id === winningPlayerId)) === null || _a === void 0 ? void 0 : _a.name} (${game.cardCzar})`);
};
const playCard = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const { gameId } = req.params;
        const { playerId, cardIds } = req.body;
        console.log(`Attempting to play card for game ${gameId}, player ${playerId}, cards ${cardIds}`);
        const game = yield Game_1.default.findById(gameId);
        if (!game) {
            return res.status(404).json({ message: 'Game not found' });
        }
        console.log('Current black card:', game.currentBlackCard);
        if (!game.currentBlackCard) {
            return res.status(400).json({ message: "No black card in play" });
        }
        console.log('Black card blanks:', game.currentBlackCard.blanks);
        if (!cardIds) {
            return res.status(400).json({ message: 'No cards provided' });
        }
        if (!Array.isArray(cardIds) || cardIds.length !== game.currentBlackCard.blanks) {
            console.log(`Expected ${game.currentBlackCard.blanks} cards, received ${cardIds ? cardIds.length : 0}`);
            return res.status(400).json({ message: `Please play ${game.currentBlackCard.blanks} card(s)` });
        }
        const player = game.players.find(p => p.id === playerId);
        if (!player) {
            return res.status(404).json({ message: 'Player not found' });
        }
        if (player.id === game.cardCzar) {
            return res.status(400).json({ message: 'Card Czar cannot play a card' });
        }
        if (game.playedCards.get(playerId)) {
            return res.status(400).json({ message: 'Player has already played a card this round' });
        }
        const playedCards = cardIds.map(cardId => {
            const cardIndex = player.hand.findIndex(c => c.id === cardId);
            if (cardIndex === -1) {
                throw new Error('Card not found in player\'s hand');
            }
            return player.hand.splice(cardIndex, 1)[0];
        });
        game.playedCards.set(playerId, playedCards);
        // Calculate remaining players
        const remainingPlayers = game.players.length - game.playedCards.size - 1; // -1 for Card Czar
        // Prepare notification
        const playerName = player.name || 'Unknown player';
        const notification = {
            title: 'Card Played',
            message: `${playerName} has played their card${cardIds.length > 1 ? 's' : ''}. ${remainingPlayers} player${remainingPlayers !== 1 ? 's' : ''} left to play.`
        };
        game.markModified('playedCards');
        game.markModified('players');
        yield game.save();
        console.log('Card played successfully');
        console.log('Updated playedCards:', game.playedCards);
        // Emit game state update to all players
        io.to(gameId).emit('gameStateUpdate', game);
        // Emit notification to all players except the one who played
        io.to(gameId).except(playerId).emit('notification', notification);
        // Handle bot actions
        let allBotsPlayed = false;
        while (!allBotsPlayed && game.phase === 'playing') {
            allBotsPlayed = yield handleBotPlayingPhase(game);
        }
        // Check if all players have played after bot actions
        const allPlayersPlayed = game.players.every(player => player.id === game.cardCzar || game.playedCards.has(player.id));
        if (allPlayersPlayed && game.phase === 'playing') {
            game.phase = 'selection';
            updateShuffledPlayedCards(game);
            console.log('All players have played. Cards shuffled and moving to selection phase.');
            yield game.save();
            io.to(gameId).emit('gameStateUpdate', game);
            // Trigger bot actions for the selection phase if the Card Czar is a bot
            if ((_a = game.players.find(p => p.id === game.cardCzar)) === null || _a === void 0 ? void 0 : _a.isBot) {
                yield handleBotSelectionPhase(game);
            }
        }
        res.status(200).json(game);
    }
    catch (error) {
        console.error('Error playing card:', error);
        res.status(500).json({ message: 'Error playing card', error: error.message });
    }
});
exports.playCard = playCard;
const updateShuffledPlayedCards = (game) => {
    const playedCardsArray = Array.from(game.playedCards.entries());
    const shuffledCards = (0, helpers_1.shuffleArray)(playedCardsArray);
    // Clear the existing playedCards and repopulate with shuffled order
    game.playedCards.clear();
    shuffledCards.forEach(([playerId, cards]) => {
        game.playedCards.set(playerId, cards);
    });
    game.markModified('playedCards');
    console.log('Shuffled and updated playedCards:', Object.fromEntries(game.playedCards));
};
const handleBotActions = (game) => __awaiter(void 0, void 0, void 0, function* () {
    switch (game.phase) {
        case 'playing':
            yield handleBotPlayingPhase(game);
            break;
        case 'selection':
            yield handleBotSelectionPhase(game);
            break;
        // Add more cases if needed for other phases
    }
});
function handleBotPlayingPhase(game) {
    return __awaiter(this, void 0, void 0, function* () {
        let allBotsPlayed = true;
        const botPlayers = game.players.filter(player => player.isBot && // is a bot
            player.id !== game.cardCzar && // not the Card Czar
            !game.playedCards.has(player.id) // hasn't played yet
        );
        // Check if any human players need to play (excluding Card Czar)
        const humanPlayersToPlay = game.players.filter(player => !player.isBot && // is human
            player.id !== game.cardCzar && // not the Card Czar
            !game.playedCards.has(player.id) // hasn't played yet
        );
        // If there are no human players that need to play, proceed with bot plays
        if (humanPlayersToPlay.length === 0) {
            for (const botPlayer of botPlayers) {
                try {
                    yield playBotCard(game, botPlayer);
                }
                catch (error) {
                    console.error(`Error playing card for bot ${botPlayer.name}:`, error);
                    allBotsPlayed = false;
                }
                // Add a delay between bot plays
                yield new Promise(resolve => setTimeout(resolve, 10));
            }
            // Check if all players (including humans and bots) have played
            const allPlayersPlayed = game.players.every(player => player.id === game.cardCzar || game.playedCards.has(player.id));
            if (allPlayersPlayed && game.phase === 'playing') {
                yield transitionToSelectionPhase(game);
            }
        }
        return allBotsPlayed;
    });
}
function transitionToSelectionPhase(game) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        game.phase = 'selection';
        updateShuffledPlayedCards(game);
        console.log('All players have played. Cards shuffled and moving to selection phase.');
        const updatedGame = yield Game_1.default.findOneAndUpdate({ _id: game._id, __v: game.__v }, {
            $set: {
                phase: game.phase,
                playedCards: game.playedCards
            },
            $inc: { __v: 1 }
        }, { new: true, runValidators: true });
        if (!updatedGame) {
            throw new Error('Game not found or version mismatch');
        }
        io.to(game._id).emit('gameStateUpdate', updatedGame);
        // Trigger bot actions for the selection phase if the Card Czar is a bot
        if ((_a = updatedGame.players.find(p => p.id === updatedGame.cardCzar)) === null || _a === void 0 ? void 0 : _a.isBot) {
            yield handleBotSelectionPhase(updatedGame);
        }
    });
}
function playBotCard(game, botPlayer) {
    return __awaiter(this, void 0, void 0, function* () {
        const playedCards = (0, botPlayer_1.botPlayCard)(game, botPlayer.id);
        if (!playedCards) {
            throw new Error(`Bot ${botPlayer.name} failed to play a card`);
        }
        const maxRetries = 5;
        const baseDelay = 10; // 10ms
        yield (0, helpers_2.exponentialBackoff)((attempt) => __awaiter(this, void 0, void 0, function* () {
            const updatedGame = yield Game_1.default.findOneAndUpdate({
                _id: game._id,
                __v: game.__v,
                [`playedCards.${botPlayer.id}`]: { $exists: false } // Ensure the bot hasn't played yet
            }, {
                $set: { [`playedCards.${botPlayer.id}`]: playedCards },
                $inc: { __v: 1 }
            }, { new: true, runValidators: true });
            if (!updatedGame) {
                throw new Error('Game not found or version mismatch');
            }
            // Update the local game object
            game.playedCards.set(botPlayer.id, playedCards);
            game.__v = updatedGame.__v;
            console.log(`Bot ${botPlayer.name} played cards:`, playedCards.map(card => card.text));
            // Emit notification and game state update
            const notification = {
                title: 'Card Played',
                message: `${botPlayer.name} has played their card${playedCards.length > 1 ? 's' : ''}.`
            };
            io.to(game._id).emit('notification', notification);
            io.to(game._id).emit('gameStateUpdate', updatedGame);
        }), maxRetries, baseDelay);
    });
}
const handleBotSelectionPhase = (game) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    if ((_a = game.players.find(p => p.id === game.cardCzar)) === null || _a === void 0 ? void 0 : _a.isBot) {
        console.log(`Bot Card Czar ${game.cardCzar} is revealing cards`);
        yield revealAllCardsForBot(game);
        yield new Promise(resolve => setTimeout(resolve, 3000));
        console.log("Starting AI-based winner selection...");
        const result = yield botSelectWinnerWithAI(game);
        if (result) {
            console.log(`AI selected winner: ${result.winningPlayerId}`);
            console.log(`Reason: ${result.reason}`);
            // Add a delay before selecting the winner
            yield new Promise(resolve => setTimeout(resolve, Math.random() * 200 + 100)); // 1-3 seconds delay
            yield handleBotSelectWinner(game, result.winningPlayerId, result.reason);
        }
        else {
            console.log("AI failed to select a winner. Falling back to random selection.");
            const randomWinner = (0, botPlayer_1.botSelectWinner)(game);
            if (randomWinner) {
                // Add a delay before selecting the winner
                yield new Promise(resolve => setTimeout(resolve, Math.random() * 200 + 100)); // 1-3 seconds delay
                yield handleBotSelectWinner(game, randomWinner, "Random selection.");
            }
        }
    }
});
const botSelectWinnerWithAI = (game) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    if (game.phase !== 'selection' || !game.currentBlackCard) {
        console.log(`Bot cannot select winner: game phase is ${game.phase} or no current black card`);
        return null;
    }
    const playerIds = Array.from(game.playedCards.keys());
    if (playerIds.length === 0) {
        console.log('Bot cannot select winner: no cards played');
        return null;
    }
    const blackCardText = game.currentBlackCard.text;
    const playedCards = Array.from(game.playedCards.entries()).map(([playerId, cards]) => ({
        playerId,
        cards: cards.map(card => card.text).join(' ')
    }));
    const prompt = `As an AI judge for Cards Against Humanity, your task is to select the funniest card combination for the following black card: "${blackCardText}". Here are the played white cards:

${playedCards.map((play, index) => `${index + 1}. ${play.cards}`).join('\n')}

Please analyze each combination and select the funniest one based on humor, cleverness, and how well it fits with the black card. You can be racist, sexist, homophobic, or any other -ist you want. Respond with the number of your selection, followed by a brief explanation of why you chose it.  For example:
"3. This is the funniest because..."`;
    console.log("Sending prompt to OpenAI:", prompt);
    try {
        const response = yield openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [{ role: "user", content: prompt }],
            max_tokens: 100,
            temperature: 0.7,
        });
        console.log("Received response from OpenAI:", response.choices[0].message.content);
        const aiResponse = ((_a = response.choices[0].message.content) === null || _a === void 0 ? void 0 : _a.trim()) || "";
        const match = aiResponse.match(/^(\d+)\.\s*(.*)$/m);
        if (match) {
            const aiChoice = parseInt(match[1], 10);
            const reason = match[2].trim();
            if (aiChoice > 0 && aiChoice <= playedCards.length) {
                const winningPlayerId = playedCards[aiChoice - 1].playerId;
                return { winningPlayerId, reason };
            }
        }
        console.log('Invalid AI response, falling back to random selection');
        const randomIndex = Math.floor(Math.random() * playerIds.length);
        return {
            winningPlayerId: playerIds[randomIndex],
            reason: "Random selection due to invalid AI response."
        };
    }
    catch (error) {
        console.error('Error using OpenAI API:', error);
        console.log('Falling back to random selection');
        const randomIndex = Math.floor(Math.random() * playerIds.length);
        return {
            winningPlayerId: playerIds[randomIndex],
            reason: "Random selection due to API error."
        };
    }
});
const revealAllCardsForBot = (game) => __awaiter(void 0, void 0, void 0, function* () {
    const unrevealedPlayerIds = [...game.playedCards.keys()].filter(id => !game.revealedCards.includes(id));
    for (const playerId of unrevealedPlayerIds) {
        game.revealedCards.push(playerId);
        game.markModified('revealedCards');
        yield game.save();
        // Emit game state update after each card reveal
        io.to(game._id).emit('gameStateUpdate', game);
        console.log(`Bot revealed card for player ${playerId}`);
        // Wait for 1 second before revealing the next card
        yield new Promise(resolve => setTimeout(resolve, 1000));
    }
    console.log('All cards have been revealed by the bot Card Czar');
});
const handleBotSelectWinner = (game, winningPlayerId, reason) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    const winningPlayer = game.players.find(p => p.id === winningPlayerId);
    if (winningPlayer) {
        winningPlayer.score += 1;
        game.phase = 'roundWinner';
        game.lastWinner = winningPlayer.name;
        game.lastWinningCard = ((_a = game.playedCards.get(winningPlayerId)) === null || _a === void 0 ? void 0 : _a[0]) || null;
        game.lastWinningReason = reason; // Add this field to your IGame interface
        console.log(`Winner selected in game ${game._id}: ${winningPlayer.name}`);
        if (winningPlayer.score >= game.winningScore) {
            game.phase = 'gameOver';
            game.winner = winningPlayer.id;
            console.log(`Game ${game._id} over. Winner: ${winningPlayer.name}`);
        }
        yield game.save();
        // Emit notification for winner selection
        const notification = {
            title: 'Winner Selected',
            message: `${(_b = game.players.find(p => p.id === game.cardCzar)) === null || _b === void 0 ? void 0 : _b.name} (Card Czar) has selected ${winningPlayer.name} as the winner! DICK`,
            reason: reason
        };
        io.to(game._id).emit('notification', notification);
        // Emit game state update
        const gameState = game.toObject();
        delete gameState.blackCards;
        delete gameState.whiteCards;
        gameState.playedCards = Object.fromEntries(game.playedCards);
        io.to(game._id).emit('gameStateUpdate', gameState);
        // Start next round after a delay
        setTimeout(() => __awaiter(void 0, void 0, void 0, function* () {
            yield startNextRound(game);
        }), 5000);
    }
});
const selectWinner = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        const { gameId } = req.params;
        const { winningPlayerId } = req.body;
        const game = yield Game_1.default.findById(gameId);
        if (!game) {
            return res.status(404).json({ message: 'Game not found' });
        }
        if (game.phase !== 'selection') {
            return res.status(400).json({ message: 'Cannot select winner in current game phase' });
        }
        const winningPlayer = game.players.find(p => p.id === winningPlayerId);
        if (!winningPlayer) {
            return res.status(400).json({ message: 'Invalid winning player' });
        }
        winningPlayer.score += 1;
        game.lastWinner = winningPlayer.name;
        game.lastWinningCard = ((_a = game.playedCards.get(winningPlayerId)) === null || _a === void 0 ? void 0 : _a[0]) || null;
        // Change phase to 'roundWinner
        game.phase = 'roundWinner';
        // If there's a passed vote waiting for card selection, don't clear it
        if (((_b = game.currentVote) === null || _b === void 0 ? void 0 : _b.status) !== 'selecting') {
            game.currentVote = null;
        }
        yield game.save();
        // Emit the updated game state
        io.to(gameId).emit('gameStateUpdate', game);
        // Set a timeout to start the next round
        setTimeout(() => __awaiter(void 0, void 0, void 0, function* () {
            yield startNextRound(game);
        }), 5000); // Wait for 5 seconds before starting the next round
        res.status(200).json(game);
    }
    catch (error) {
        console.error('Error selecting winner:', error);
        res.status(500).json({ message: 'Error selecting winner', error: error.message });
    }
});
exports.selectWinner = selectWinner;
const startNextRound = (game) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c;
    try {
        if (game.phase !== 'roundWinner') {
            console.log('Game is not in roundWinner phase. Skipping next round start.');
            return;
        }
        // If there's a vote in selecting status, don't start the next round
        if (((_a = game.currentVote) === null || _a === void 0 ? void 0 : _a.status) === 'selecting') {
            console.log('Waiting for card selection before starting next round');
            return;
        }
        const winningPlayer = game.players.find(p => p.name === game.lastWinner);
        if (winningPlayer && winningPlayer.score >= game.winningScore) {
            game.phase = 'gameOver';
            game.winner = winningPlayer.id;
            io.to(game._id).emit('gameOver', {
                winner: winningPlayer,
                usedPacks: [...new Set([...game.selectedBlackCardPacksIDs, ...game.selectedWhiteCardPacksIDs])]
            });
        }
        else {
            // Check if there's a passed vote that needs to be executed
            if (((_b = game.currentVote) === null || _b === void 0 ? void 0 : _b.status) === 'passed') {
                game.currentVote.status = 'selecting';
                yield game.save();
                // Emit event to trigger card selection
                io.to(game._id).emit('gameStateUpdate', game);
                // Wait for card selection before proceeding
                return;
            }
            game.round += 1;
            game.phase = 'playing';
            game.revealedCards = [];
            game.playedCards.clear();
            game.currentBlackCard = game.blackCards.pop() || null;
            // Rotate Card Czar
            rotateCardCzar(game, (winningPlayer === null || winningPlayer === void 0 ? void 0 : winningPlayer.id) || '');
            // Deal new cards to all players
            game.players.forEach(player => {
                const cardsNeeded = 10 - player.hand.length;
                player.hand.push(...game.whiteCards.splice(0, cardsNeeded));
            });
        }
        // Use findOneAndUpdate with optimistic concurrency control
        const updatedGame = yield Game_1.default.findOneAndUpdate({ _id: game._id, __v: game.__v }, {
            $set: {
                round: game.round,
                phase: game.phase,
                revealedCards: game.revealedCards,
                playedCards: game.playedCards,
                blackCards: game.blackCards,
                currentBlackCard: game.currentBlackCard,
                cardCzar: game.cardCzar,
                whiteCards: game.whiteCards,
                players: game.players,
                winner: game.winner
            },
            $inc: { __v: 1 }
        }, { new: true, runValidators: true });
        if (!updatedGame) {
            throw new Error('Game not found or version mismatch');
        }
        // Emit the updated game state
        io.to(game._id).emit('gameStateUpdate', updatedGame);
        // Emit notification for new round
        if (game.phase === 'playing') {
            const notification = {
                title: 'New Round',
                message: `Round ${updatedGame.round} has started. ${(_c = updatedGame.players.find(p => p.id === updatedGame.cardCzar)) === null || _c === void 0 ? void 0 : _c.name} is the new Card Czar.`
            };
            io.to(game._id).emit('notification', notification);
            // Handle bot actions for the new round
            if (updatedGame.phase === 'playing') {
                // Add a small delay before bots start playing
                setTimeout(() => __awaiter(void 0, void 0, void 0, function* () {
                    yield handleBotActions(updatedGame);
                }), 2000);
            }
        }
        return; // Success, exit the retry loop
    }
    catch (error) {
        console.error('Error starting next round:', error);
        throw error;
    }
});
const rejoinGame = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { gameId } = req.params;
        const { playerId, playerName } = req.body;
        const game = yield Game_1.default.findById(gameId);
        if (!game) {
            return res.status(404).json({ message: 'Game not found' });
        }
        const existingPlayer = game.players.find(p => p.id === playerId && p.name === playerName);
        if (!existingPlayer) {
            return res.status(404).json({ message: 'Player not found in this game' });
        }
        // Player successfully rejoined
        res.status(200).json({ message: 'Successfully rejoined the game', gameState: game });
    }
    catch (error) {
        console.error('Error rejoining game:', error);
        res.status(500).json({ message: 'Error rejoining game', error: error.message });
    }
});
exports.rejoinGame = rejoinGame;
const getCurrentPlayers = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        // Fetch current games logic here
        const games = yield Game_1.default.find({}, '_id players phase creatorId createdAt gameName');
        const currentGames = games.map(game => {
            var _a;
            return ({
                gameId: game._id,
                gameName: game.gameName,
                creatorName: ((_a = game.players.find(player => player.id === game.creatorId)) === null || _a === void 0 ? void 0 : _a.name) || game.creatorId,
                players: game.players.map(player => player.name),
                playerCount: game.players.length,
                phase: game.phase,
                creatorId: game.creatorId,
                createdAt: game.createdAt
            });
        });
        res.status(200).json({ message: 'Games found', games: currentGames });
    }
    catch (error) {
        console.error('Error fetching current games:', error);
        res.status(500).json({ message: 'Error fetching current games' });
    }
});
exports.getCurrentPlayers = getCurrentPlayers;
const revealCard = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    console.log('revealCard function called');
    try {
        const { gameId } = req.params;
        const { playerId } = req.body;
        console.log(`Revealing card for game ${gameId}, player ${playerId}`);
        let game = yield Game_1.default.findById(gameId);
        if (!game) {
            console.log(`Game ${gameId} not found`);
            return res.status(404).json({ message: 'Game not found' });
        }
        console.log('Game found:', game._id);
        if (game.cardCzar !== playerId) {
            console.log(`Player ${playerId} is not the Card Czar (${game.cardCzar})`);
            return res.status(403).json({ message: 'Only the Card Czar can reveal cards' });
        }
        console.log('Player is Card Czar');
        console.log('Played cards:', JSON.stringify(Object.fromEntries(game.playedCards)));
        console.log('Current revealed cards:', game.revealedCards);
        const unrevealedPlayerIds = [...game.playedCards.keys()].filter(id => !game.revealedCards.includes(id));
        console.log('Unrevealed player IDs:', unrevealedPlayerIds);
        if (unrevealedPlayerIds.length === 0) {
            console.log('All cards have been revealed');
            return res.status(400).json({ message: 'All cards have been revealed' });
        }
        const playerIdToReveal = unrevealedPlayerIds[Math.floor(Math.random() * unrevealedPlayerIds.length)];
        console.log('Player ID to reveal:', playerIdToReveal);
        game.revealedCards.push(playerIdToReveal);
        console.log('Updated revealed cards:', game.revealedCards);
        game.markModified('revealedCards');
        yield game.save();
        // Emit socket event for real-time update
        io.to(gameId).emit('cardRevealed', { gameId, revealedPlayerId: playerIdToReveal });
        console.log('Game saved successfully after revealing card');
        res.status(200).json({
            message: 'Card revealed successfully',
            revealedPlayerId: playerIdToReveal
        });
    }
    catch (error) {
        console.error('Error revealing card:', error);
        res.status(500).json({ message: 'Error revealing card' });
    }
});
exports.revealCard = revealCard;
const deleteGame = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { gameId } = req.params;
        const { creatorId } = req.body;
        const game = yield Game_1.default.findById(gameId);
        if (!game) {
            return res.status(404).json({ message: 'Game not found' });
        }
        if (game.creatorId !== creatorId) {
            return res.status(403).json({ message: 'Only the game creator can delete the game' });
        }
        yield Game_1.default.findByIdAndDelete(gameId);
        console.log(`Game ${gameId} has been deleted`);
        res.status(200).json({ message: 'Game successfully deleted' });
    }
    catch (error) {
        console.error('Error deleting game:', error);
        res.status(500).json({ message: 'Error deleting game' });
    }
});
exports.deleteGame = deleteGame;
const deleteFinishedInactiveGames = () => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000);
        console.log('Checking for finished and inactive games last updated before:', threeHoursAgo);
        const result = yield Game_1.default.deleteMany({
            $or: [
                { phase: 'gameOver' },
                { activePlayers: { $size: 0 } }
            ],
            updatedAt: { $lt: threeHoursAgo }
        });
        console.log(`Deleted ${result.deletedCount} finished and inactive games`);
    }
    catch (error) {
        console.error('Error deleting finished and inactive games:', error);
    }
});
exports.deleteFinishedInactiveGames = deleteFinishedInactiveGames;
// Set up a cron job to run every minute
node_cron_1.default.schedule('0 * * * *', () => {
    console.log('Running scheduled task to delete finished and inactive games');
    (0, exports.deleteFinishedInactiveGames)();
});
const getAvailablePacks = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const packs = yield Card_1.CardPack.find()
            .populate('createdBy', 'username');
        const cardCounts = yield Card_1.Card.aggregate([
            {
                $group: {
                    _id: '$pack',
                    blackCardCount: {
                        $sum: { $cond: [{ $eq: ['$type', 'black'] }, 1, 0] }
                    },
                    whiteCardCount: {
                        $sum: { $cond: [{ $eq: ['$type', 'white'] }, 1, 0] }
                    }
                }
            }
        ]);
        const cardCountMap = new Map(cardCounts.map(item => [item._id.toString(), item]));
        const transformedPacks = packs.map(pack => {
            const counts = cardCountMap.get(pack._id.toString()) || { blackCardCount: 0, whiteCardCount: 0 };
            return Object.assign(Object.assign({}, transformMongoDocument(pack)), { createdBy: pack.createdBy && 'username' in pack.createdBy ? pack.createdBy.username : 'Unknown', blackCardCount: counts.blackCardCount, whiteCardCount: counts.whiteCardCount });
        });
        res.json({ availablePacks: transformedPacks });
    }
    catch (error) {
        console.error('Error fetching available packs:', error);
        res.status(500).json({ message: 'Error fetching available packs', error: error.message });
    }
});
exports.getAvailablePacks = getAvailablePacks;
// Add this function to update online status
const updateOnlineStatus = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { gameId } = req.params;
    const { playerId, isOnline } = req.body;
    try {
        console.log(`Updating online status for game ${gameId}, player ${playerId}, isOnline: ${isOnline}`);
        const game = yield Game_1.default.findById(gameId);
        if (!game) {
            console.log(`Game ${gameId} not found`);
            return res.status(404).json({ message: 'Game not found' });
        }
        if (isOnline) {
            if (!game.onlineUsers.includes(playerId)) {
                game.onlineUsers.push(playerId);
                console.log(`Player ${playerId} is now online in game ${gameId}`);
            }
        }
        else {
            game.onlineUsers = game.onlineUsers.filter(id => id !== playerId);
            console.log(`Player ${playerId} is now offline in game ${gameId}`);
        }
        yield game.save();
        console.log(`Current online users in game ${gameId}:`, game.onlineUsers);
        // Emit updated online users to all players in the game
        io.to(gameId).emit('onlineUsersUpdate', game.onlineUsers);
        res.status(200).json({ message: 'Online status updated', onlineUsers: game.onlineUsers });
    }
    catch (error) {
        console.error('Error updating online status:', error);
        res.status(500).json({ message: 'Error updating online status', error: error.message });
    }
});
exports.updateOnlineStatus = updateOnlineStatus;
// Add this function to get online users
const getOnlineUsers = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { gameId } = req.params;
        const game = yield Game_1.default.findById(gameId);
        if (!game) {
            console.log(`Game ${gameId} not found`);
            return res.status(404).json({ message: 'Game not found' });
        }
        const onlineUsers = game.players.filter(player => game.onlineUsers.includes(player.id));
        console.log(`Online users in game ${gameId}:`, onlineUsers.map(user => user.name));
        res.status(200).json({ onlineUsers: onlineUsers.map(user => ({ id: user.id, name: user.name })) });
    }
    catch (error) {
        console.error('Error getting online users:', error);
        res.status(500).json({ message: 'Error getting online users', error: error.message });
    }
});
exports.getOnlineUsers = getOnlineUsers;
const addChatMessage = (gameId_1, sender_1, content_1, ...args_1) => __awaiter(void 0, [gameId_1, sender_1, content_1, ...args_1], void 0, function* (gameId, sender, content, isSystemMessage = false) {
    try {
        const messageId = new mongoose_1.default.Types.ObjectId().toString();
        const message = {
            _id: messageId,
            sender,
            content,
            timestamp: new Date(),
            isSystemMessage,
            gameId
        };
        const game = yield Game_1.default.findByIdAndUpdate(gameId, { $push: { chatMessages: message } }, { new: true });
        if (!game) {
            throw new Error('Game not found');
        }
        // Transform the message for the response
        return {
            id: messageId, // Use consistent id field for frontend
            sender,
            content,
            timestamp: message.timestamp,
            gameId,
            isSystemMessage
        };
    }
    catch (error) {
        console.error('Error adding chat message:', error);
        throw error;
    }
});
exports.addChatMessage = addChatMessage;
const getOlderMessages = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { gameId } = req.params;
        const { page = 1 } = req.query;
        const game = yield Game_1.default.findById(gameId);
        if (!game) {
            return res.status(404).json({ message: 'Game not found' });
        }
        const pageNumber = parseInt(page, 10);
        const startIndex = game.chatMessages.length - (pageNumber * MESSAGES_PER_PAGE);
        const endIndex = startIndex + MESSAGES_PER_PAGE;
        const olderMessages = game.chatMessages.slice(Math.max(0, startIndex), endIndex);
        res.json({ messages: olderMessages, hasMore: startIndex > 0 });
    }
    catch (error) {
        console.error('Error getting older messages:', error);
        res.status(500).json({ message: 'Error getting older messages', error: error.message });
    }
});
exports.getOlderMessages = getOlderMessages;
const createCard = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { text, type, pack, blanks } = req.body;
        const createdBy = req.userId;
        const cardPack = yield Card_1.CardPack.findById(pack);
        if (!cardPack) {
            return res.status(404).json({ message: 'Card pack not found' });
        }
        if (cardPack.isOriginal) {
            return res.status(403).json({ message: 'Cannot add cards to original packs' });
        }
        if (cardPack.createdBy && cardPack.createdBy.toString() !== createdBy) {
            return res.status(403).json({ message: 'You do not have permission to add cards to this pack' });
        }
        const newCard = new Card_1.Card({
            text,
            type,
            pack,
            blanks: type === 'black' ? blanks : undefined,
            createdBy,
            createdAt: new Date()
        });
        yield newCard.save();
        res.status(201).json(transformMongoDocument(newCard));
    }
    catch (error) {
        res.status(400).json({ message: 'Error creating card', error });
    }
});
exports.createCard = createCard;
const editCard = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { cardId } = req.params;
        const { text, blanks } = req.body;
        const userId = req.userId;
        const card = yield Card_1.Card.findById(cardId).populate('pack');
        if (!card) {
            return res.status(404).json({ message: 'Card not found' });
        }
        if (card.pack.isOriginal) {
            return res.status(403).json({ message: 'Cannot edit cards in original packs' });
        }
        if (card.createdBy && card.createdBy.toString() !== userId) {
            return res.status(403).json({ message: 'You do not have permission to edit this card' });
        }
        const updatedCard = yield Card_1.Card.findByIdAndUpdate(cardId, { text, blanks }, { new: true });
        if (!updatedCard) {
            return res.status(404).json({ message: 'Card not found' });
        }
        res.json(transformMongoDocument(updatedCard));
    }
    catch (error) {
        res.status(400).json({ message: 'Error updating card', error });
    }
});
exports.editCard = editCard;
const deleteCard = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { cardId } = req.params;
        const userId = req.body.userId;
        const card = yield Card_1.Card.findById(cardId).populate('pack');
        if (!card) {
            return res.status(404).json({ message: 'Card not found' });
        }
        if (card.pack.isOriginal) {
            return res.status(403).json({ message: 'Cannot delete cards from original packs' });
        }
        if (card.createdBy && card.createdBy.toString() !== userId) {
            return res.status(403).json({ message: 'You do not have permission to delete this card' });
        }
        yield Card_1.Card.findByIdAndDelete(cardId);
        res.json({ message: 'Card deleted successfully' });
    }
    catch (error) {
        res.status(400).json({ message: 'Error deleting card', error });
    }
});
exports.deleteCard = deleteCard;
const createPack = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { name, isPublic, imageUrl } = req.body;
        const createdBy = req.userId;
        console.log('CreatePack - Request details:', {
            body: req.body,
            headers: req.headers,
            userId: createdBy,
            auth: {
                isAuthenticated: req.isAuthenticated,
                username: req.username
            }
        });
        if (!createdBy) {
            console.log('CreatePack - Authentication failed: No userId');
            return res.status(401).json({ message: 'Authentication required' });
        }
        console.log('CreatePack - Creating pack with data:', {
            name,
            isPublic,
            imageUrl,
            createdBy
        });
        const newPack = new Card_1.CardPack({
            name,
            isPublic,
            imageUrl,
            createdBy,
            blackCardCount: 0,
            whiteCardCount: 0,
            isOriginal: false,
            usageCount: 0,
            rating: 0
        });
        const savedPack = yield newPack.save();
        console.log('CreatePack - Pack saved successfully:', savedPack);
        res.status(201).json(transformMongoDocument(savedPack));
    }
    catch (error) {
        console.error('CreatePack - Error:', error);
        res.status(400).json({ message: 'Error creating pack', error: error.message });
    }
});
exports.createPack = createPack;
const editPack = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { packId } = req.params;
        const { name, isPublic } = req.body;
        const userId = req.userId;
        const pack = yield Card_1.CardPack.findById(packId);
        if (!pack) {
            return res.status(404).json({ message: 'Pack not found' });
        }
        if (pack.isOriginal) {
            return res.status(403).json({ message: 'Cannot edit original packs' });
        }
        if (pack.createdBy.toString() !== userId) {
            return res.status(403).json({ message: 'You do not have permission to edit this pack' });
        }
        const updatedPack = yield Card_1.CardPack.findByIdAndUpdate(packId, { name, isPublic }, { new: true });
        if (!updatedPack) {
            return res.status(404).json({ message: 'Pack not found' });
        }
        res.json(transformMongoDocument(updatedPack));
    }
    catch (error) {
        res.status(400).json({ message: 'Error updating pack', error: error.message });
    }
});
exports.editPack = editPack;
const deletePack = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { packId } = req.params;
        const userId = req.userId;
        const pack = yield Card_1.CardPack.findById(packId);
        if (!pack) {
            return res.status(404).json({ message: 'Pack not found' });
        }
        if (pack.isOriginal) {
            return res.status(403).json({ message: 'Cannot delete original packs' });
        }
        if (pack.createdBy.toString() !== userId) {
            return res.status(403).json({ message: 'You do not have permission to delete this pack' });
        }
        yield Card_1.CardPack.findByIdAndDelete(packId);
        // Also delete all cards associated with this pack
        yield Card_1.Card.deleteMany({ pack: packId });
        res.json({ message: 'Pack and associated cards deleted successfully' });
    }
    catch (error) {
        res.status(400).json({ message: 'Error deleting pack', error: error.message });
    }
});
exports.deletePack = deletePack;
const getCardPacks = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const userId = req.userId;
        const packs = yield Card_1.CardPack.find({
            $or: [
                { isPublic: true },
                { createdBy: userId }
            ]
        }).populate('cards');
        const packsWithCards = packs.map(pack => (Object.assign({}, pack.toObject())));
        res.json(packsWithCards);
    }
    catch (error) {
        res.status(400).json({ message: 'Error fetching packs', error });
    }
});
exports.getCardPacks = getCardPacks;
const getPackCards = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { packId } = req.params;
        const { sortOrder = 'desc' } = req.query;
        const cards = yield Card_1.Card.find({ pack: packId })
            .sort({ createdAt: sortOrder === 'asc' ? 1 : -1 });
        // Transform the cards before sending
        const transformedCards = cards.map(card => transformMongoDocument(card));
        res.json(transformedCards);
    }
    catch (error) {
        console.error('Error fetching pack cards:', error);
        res.status(500).json({ message: 'Error fetching pack cards', error: error.message });
    }
});
exports.getPackCards = getPackCards;
// Add a new function for authenticated-only features
const getPlayerStats = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    if (req.isAnonymous) {
        return res.status(403).json({ message: 'This feature is only available for registered users' });
    }
    try {
        // Fetch and return player stats
        // This is just a placeholder, implement actual stats retrieval logic
        res.json({
            gamesPlayed: 10,
            gamesWon: 3,
            totalScore: 150
        });
    }
    catch (error) {
        console.error('Error fetching player stats:', error);
        res.status(500).json({ message: 'Error fetching player stats', error: error.message });
    }
});
exports.getPlayerStats = getPlayerStats;
// Add this function to update pack usage and rating
const updatePackUsageAndRating = (packId, rating) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const pack = yield Card_1.CardPack.findById(packId);
        if (pack) {
            pack.usageCount += 1;
            pack.rating = ((pack.rating * (pack.usageCount - 1)) + rating) / pack.usageCount;
            yield pack.save();
        }
    }
    catch (error) {
        console.error('Error updating pack usage and rating:', error);
    }
});
exports.updatePackUsageAndRating = updatePackUsageAndRating;
// Add these new controller functions
const rateCardPack = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { packId } = req.params;
        const { rating, cardType } = req.body; // Add cardType to specify which type is being rated
        if (rating < 1 || rating > 5) {
            return res.status(400).json({ message: 'Rating must be between 1 and 5' });
        }
        if (!['black', 'white', 'both'].includes(cardType)) {
            return res.status(400).json({ message: 'Invalid card type specified' });
        }
        const pack = yield Card_1.CardPack.findById(packId);
        if (!pack) {
            return res.status(404).json({ message: 'Pack not found' });
        }
        // Update the appropriate rating based on card type
        const updateData = {};
        if (cardType === 'both' || cardType === 'black') {
            const newBlackRating = ((pack.blackCardRating * pack.blackCardUsage) + rating) / (pack.blackCardUsage + 1);
            updateData.blackCardRating = Number(newBlackRating.toFixed(2));
            updateData.blackCardUsage = pack.blackCardUsage + 1;
        }
        if (cardType === 'both' || cardType === 'white') {
            const newWhiteRating = ((pack.whiteCardRating * pack.whiteCardUsage) + rating) / (pack.whiteCardUsage + 1);
            updateData.whiteCardRating = Number(newWhiteRating.toFixed(2));
            updateData.whiteCardUsage = pack.whiteCardUsage + 1;
        }
        // Calculate overall rating
        const totalUsage = (updateData.blackCardUsage || pack.blackCardUsage) +
            (updateData.whiteCardUsage || pack.whiteCardUsage);
        const weightedRating = (((updateData.blackCardRating || pack.blackCardRating) * (updateData.blackCardUsage || pack.blackCardUsage)) +
            ((updateData.whiteCardRating || pack.whiteCardRating) * (updateData.whiteCardUsage || pack.whiteCardUsage))) / totalUsage;
        updateData.rating = Number(weightedRating.toFixed(2));
        const updatedPack = yield Card_1.CardPack.findByIdAndUpdate(packId, { $set: updateData }, { new: true });
        res.json({
            message: 'Rating submitted successfully',
            pack: updatedPack
        });
    }
    catch (error) {
        console.error('Error rating pack:', error);
        res.status(500).json({ message: 'Error submitting rating', error: error.message });
    }
});
exports.rateCardPack = rateCardPack;
const getSortedPacks = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { sortBy = 'rating', order = 'desc' } = req.query;
        const userId = req.userId;
        const sortOptions = {
            [sortBy]: order === 'desc' ? -1 : 1
        };
        const packs = yield Card_1.CardPack.find({
            $or: [
                { isPublic: true },
                { createdBy: userId }
            ]
        })
            .sort(sortOptions)
            .populate('createdBy', 'username')
            .lean();
        const transformedPacks = packs.map(pack => ({
            id: pack._id,
            name: pack.name,
            rating: pack.rating,
            usageCount: pack.usageCount,
            createdAt: pack.createdAt,
            isPublic: pack.isPublic,
            isOriginal: pack.isOriginal,
            createdBy: pack.createdBy.username || 'Unknown',
            imageUrl: pack.imageUrl
        }));
        res.json({ packs: transformedPacks });
    }
    catch (error) {
        console.error('Error fetching sorted packs:', error);
        res.status(500).json({ message: 'Error fetching packs', error: error.message });
    }
});
exports.getSortedPacks = getSortedPacks;
/* export const getMessagesSince = async (gameId: string, timestamp: Date) => {
    try {
        const game = await Game.findById(gameId);
        if (!game) {
            return [];
        }

        // Filter messages after the given timestamp
        const messages = game.chatMessages.filter(msg =>
            new Date(msg.timestamp) > timestamp
        );

        // Transform messages to ensure consistent id field
        return messages.map(msg => ({
            id: msg._id.toString(), // Convert MongoDB _id to id for frontend
            sender: msg.sender,
            content: msg.content,
            timestamp: msg.timestamp,
            gameId: gameId,
            isSystemMessage: msg.isSystemMessage
        }));
    } catch (error) {
        console.error('Error getting messages since timestamp:', error);
        throw error;
    }
}; */
const initiateVote = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { gameId } = req.params;
        const { playerId, cardCount } = req.body;
        console.log('Initiating vote:', { gameId, playerId, cardCount });
        const game = yield Game_1.default.findById(gameId);
        if (!game) {
            return res.status(404).json({ message: 'Game not found' });
        }
        // Validate phase
        if (game.phase !== 'playing') {
            return res.status(400).json({ message: 'Votes can only be initiated during the playing phase' });
        }
        // Check if player has already used their vote
        /* if (game.usedVotes.includes(playerId)) {
            return res.status(400).json({ message: 'You have already used your vote this game' });
        } */
        // Check if there's an active vote
        if (game.currentVote && game.currentVote.status === 'active') {
            return res.status(400).json({ message: 'There is already an active vote' });
        }
        // Check cooldown period
        if (game.lastVoteRound && game.round - game.lastVoteRound < 2) {
            return res.status(400).json({ message: 'Must wait one round between votes' });
        }
        // Check if enough cards in deck
        const minRequiredCards = cardCount * game.players.length;
        if (game.whiteCards.length < minRequiredCards) {
            return res.status(400).json({
                message: `Not enough cards in deck. Need ${minRequiredCards} cards for this vote.`
            });
        }
        const newVote = {
            id: new mongoose_1.default.Types.ObjectId().toString(),
            initiator: playerId,
            cardCount,
            timestamp: new Date(),
            votes: { [playerId]: true }, // Initiator automatically votes yes
            status: 'active',
            cardsToChange: new Map(),
            roundInitiated: game.round
        };
        game.previousPhase = game.phase;
        game.phase = 'voting';
        game.currentVote = newVote;
        yield game.save();
        io.to(gameId).emit('gameStateUpdate', game);
        io.to(gameId).emit('voteInitiated', { vote: newVote });
        console.log('Initial vote state:', {
            id: newVote.id,
            votes: newVote.votes,
            initiator: newVote.initiator
        });
        game.currentVote = newVote;
        yield game.save();
        // Handle bot votes
        setTimeout(() => __awaiter(void 0, void 0, void 0, function* () {
            var _a, _b, _c, _d;
            try {
                const updatedGame = yield Game_1.default.findById(gameId);
                if (!updatedGame) {
                    console.error('Game not found during bot voting');
                    return;
                }
                const botPlayers = updatedGame.players.filter(p => { var _a; return p.isBot && p.id !== ((_a = updatedGame.currentVote) === null || _a === void 0 ? void 0 : _a.initiator); });
                console.log('Bot players about to vote:', botPlayers.map(b => ({ id: b.id, name: b.name })));
                for (const bot of botPlayers) {
                    try {
                        const botVote = (0, botPlayer_1.botHandleVote)(updatedGame, bot.id);
                        console.log('Before bot vote update:', {
                            botId: bot.id,
                            botName: bot.name,
                            currentVotes: (_a = updatedGame.currentVote) === null || _a === void 0 ? void 0 : _a.votes,
                            botVoteDecision: botVote
                        });
                        // Find and update the game document atomically
                        const gameAfterVote = yield Game_1.default.findOneAndUpdate({
                            _id: gameId,
                            'currentVote.id': (_b = updatedGame.currentVote) === null || _b === void 0 ? void 0 : _b.id
                        }, {
                            $set: {
                                [`currentVote.votes.${bot.id}`]: botVote
                            }
                        }, { new: true });
                        if (!gameAfterVote) {
                            console.error('Failed to update game with bot vote');
                            continue;
                        }
                        console.log('After bot vote update:', {
                            votes: (_c = gameAfterVote.currentVote) === null || _c === void 0 ? void 0 : _c.votes,
                            totalVotes: ((_d = gameAfterVote.currentVote) === null || _d === void 0 ? void 0 : _d.votes) ?
                                Object.keys(gameAfterVote.currentVote.votes).length : 0
                        });
                        // Emit vote update
                        if (gameAfterVote.currentVote) {
                            const voteForEmit = Object.assign(Object.assign({}, gameAfterVote.currentVote), { votes: gameAfterVote.currentVote.votes instanceof Map ?
                                    Object.fromEntries(gameAfterVote.currentVote.votes) :
                                    gameAfterVote.currentVote.votes });
                            io.to(gameId).emit('voteUpdated', voteForEmit);
                            // Check if all players have voted and resolve immediately if they have
                            const totalVotes = Object.keys(gameAfterVote.currentVote.votes).length;
                            if (totalVotes === gameAfterVote.players.length) {
                                console.log('All players (including bots) have voted - resolving vote immediately');
                                yield resolveVote(gameId);
                                break; // Exit the loop since we've resolved the vote
                            }
                        }
                        // Add a small delay between bot votes if we haven't resolved yet
                        yield new Promise(resolve => setTimeout(resolve, 500));
                    }
                    catch (error) {
                        console.error(`Error processing bot vote for ${bot.name}:`, error);
                    }
                }
            }
            catch (error) {
                console.error('Error in bot voting timeout:', error);
            }
        }), 3000);
        res.status(200).json({ vote: newVote });
    }
    catch (error) {
        console.error('Error initiating vote:', error);
        res.status(500).json({ message: 'Error initiating vote', error: error.message });
    }
});
exports.initiateVote = initiateVote;
const submitVote = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { gameId } = req.params;
        const { playerId, vote } = req.body;
        const updatedGame = yield Game_1.default.findOneAndUpdate({
            _id: gameId,
            'currentVote.status': 'active'
        }, {
            $set: { [`currentVote.votes.${playerId}`]: vote }
        }, { new: true });
        if (!updatedGame) {
            return res.status(404).json({ message: 'Game not found or vote is no longer active' });
        }
        // Emit vote update
        if (updatedGame.currentVote) {
            const voteForEmit = Object.assign(Object.assign({}, updatedGame.currentVote), { votes: updatedGame.currentVote.votes instanceof Map ?
                    Object.fromEntries(updatedGame.currentVote.votes) :
                    updatedGame.currentVote.votes });
            io.to(gameId).emit('voteUpdated', voteForEmit);
            // Check if all players have voted and resolve immediately if they have
            const totalVotes = updatedGame.currentVote.votes instanceof Map ?
                updatedGame.currentVote.votes.size :
                Object.keys(updatedGame.currentVote.votes).length;
            if (totalVotes === updatedGame.players.length) {
                console.log('All players (including bots) have voted - resolving vote immediately');
                yield resolveVote(gameId);
            }
        }
        res.status(200).json({ message: 'Vote submitted successfully' });
    }
    catch (error) {
        console.error('Error submitting vote:', error);
        res.status(500).json({ message: 'Error submitting vote', error: error.message });
    }
});
exports.submitVote = submitVote;
const selectCardsToChange = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { gameId } = req.params;
        const { playerId, cardIds } = req.body;
        console.log('=== SELECTING CARDS TO CHANGE ===', { gameId, playerId, cardIds });
        const game = yield Game_1.default.findById(gameId);
        if (!game || !game.currentVote) {
            console.log('Error: Game or vote not found');
            return res.status(404).json({ message: 'Game or vote not found' });
        }
        if (game.currentVote.status !== 'selecting') {
            console.log('Error: Invalid vote status:', game.currentVote.status);
            return res.status(400).json({ message: 'No active selecting vote' });
        }
        if (cardIds.length !== game.currentVote.cardCount) {
            console.log('Error: Invalid card count');
            return res.status(400).json({
                message: `Must select exactly ${game.currentVote.cardCount} cards`
            });
        }
        // Initialize cardsToChange if it doesn't exist
        if (!game.currentVote.cardsToChange) {
            game.currentVote.cardsToChange = new Map();
        }
        // Update using Map methods
        game.currentVote.cardsToChange.set(playerId, cardIds);
        game.markModified('currentVote.cardsToChange');
        // Emit card selection update
        console.log("emited cardSelectionUpdated to game", gameId);
        io.to(gameId).emit('cardSelectionUpdated', {
            selections: Object.fromEntries(game.currentVote.cardsToChange),
            requiredSelections: game.players.length
        });
        yield game.save();
        // Update the player selection check
        const allPlayersSelected = game.players.every(player => { var _a, _b, _c; return ((_b = (_a = game.currentVote) === null || _a === void 0 ? void 0 : _a.cardsToChange.get(player.id)) === null || _b === void 0 ? void 0 : _b.length) === ((_c = game.currentVote) === null || _c === void 0 ? void 0 : _c.cardCount); });
        if (allPlayersSelected) {
            console.log('All players have selected cards - executing card change');
            yield executeCardChange(gameId);
        }
        res.status(200).json({ message: 'Cards selected successfully' });
    }
    catch (error) {
        console.error('Error in selectCardsToChange:', {
            error: error.message,
            stack: error.stack,
            timestamp: new Date().toISOString()
        });
        res.status(500).json({ message: 'Error selecting cards', error: error.message });
    }
});
exports.selectCardsToChange = selectCardsToChange;
const resolveVote = (gameId) => __awaiter(void 0, void 0, void 0, function* () {
    const game = yield Game_1.default.findById(gameId);
    if (!game || !game.currentVote) {
        return;
    }
    // Get total number of votes cast
    const totalVotesCast = game.currentVote.votes instanceof Map ?
        game.currentVote.votes.size :
        Object.keys(game.currentVote.votes).length;
    const totalPlayers = game.players.length;
    // Only resolve if all players have voted
    if (totalVotesCast < totalPlayers) {
        console.log('Waiting for more votes:', {
            totalVotesCast,
            totalPlayers,
            pendingVotes: totalPlayers - totalVotesCast
        });
        return;
    }
    const agreeingPlayers = game.currentVote.votes instanceof Map ?
        Array.from(game.currentVote.votes.values()).filter(vote => vote === true).length :
        Object.values(game.currentVote.votes).filter(vote => vote === true).length;
    const passed = agreeingPlayers > totalPlayers / 2;
    // Set initial status to passed/failed
    game.currentVote.status = passed ? 'passed' : 'failed';
    yield game.save();
    // Emit vote resolution immediately
    io.to(gameId).emit('voteResolved', {
        passed,
        vote: game.currentVote
    });
    // If passed, wait 5 seconds before transitioning to selecting state
    if (passed) {
        game.lastVoteRound = game.round;
        game.usedVotes.push(game.currentVote.initiator);
        if (!game.previousPhase) {
            game.previousPhase = game.phase;
        }
        game.phase = 'voting';
        yield game.save();
        // Wait 5 seconds before transitioning to selecting state
        setTimeout(() => __awaiter(void 0, void 0, void 0, function* () {
            var _a;
            const updatedGame = yield Game_1.default.findById(gameId);
            if (!updatedGame || !updatedGame.currentVote)
                return;
            // Only proceed if we're still in the same vote
            if (updatedGame.currentVote.id === ((_a = game.currentVote) === null || _a === void 0 ? void 0 : _a.id)) {
                // Create a new game state update with the selecting status
                updatedGame.currentVote.status = 'selecting';
                yield updatedGame.save();
                // Emit the state change
                io.to(gameId).emit('gameStateUpdate', updatedGame);
            }
        }), 2000);
    }
    else {
        // For failed votes, wait 5 seconds before clearing
        setTimeout(() => __awaiter(void 0, void 0, void 0, function* () {
            var _a, _b;
            const updatedGame = yield Game_1.default.findById(gameId);
            if (updatedGame && ((_a = updatedGame.currentVote) === null || _a === void 0 ? void 0 : _a.id) === ((_b = game.currentVote) === null || _b === void 0 ? void 0 : _b.id)) {
                updatedGame.currentVote = null;
                if (updatedGame.phase === 'voting') {
                    updatedGame.phase = updatedGame.previousPhase || 'playing';
                    updatedGame.previousPhase = undefined;
                }
                yield updatedGame.save();
                io.to(gameId).emit('gameStateUpdate', updatedGame);
            }
        }), 2000);
    }
});
const executeCardChange = (gameId) => __awaiter(void 0, void 0, void 0, function* () {
    console.log('=== EXECUTE CARD CHANGE START ===');
    try {
        const game = yield Game_1.default.findById(gameId);
        if (!game || !game.currentVote) {
            console.log('No game or vote found');
            return;
        }
        // Handle bot card selections first
        const botPlayers = game.players.filter(p => p.isBot);
        for (const bot of botPlayers) {
            if (!game.currentVote.cardsToChange.get(bot.id)) {
                const selectedCards = (0, botPlayer_1.botSelectCardsToChange)(game, bot.id);
                game.currentVote.cardsToChange.set(bot.id, selectedCards);
            }
        }
        // Handle random selection for players who haven't chosen
        for (const player of game.players) {
            if (!game.currentVote.cardsToChange.get(player.id)) {
                console.log(`Player ${player.name} didn't select cards, choosing randomly`);
                const randomCards = [];
                const availableCards = [...player.hand];
                for (let i = 0; i < game.currentVote.cardCount; i++) {
                    if (availableCards.length === 0)
                        break;
                    const randomIndex = Math.floor(Math.random() * availableCards.length);
                    const card = availableCards.splice(randomIndex, 1)[0];
                    randomCards.push(card.id);
                }
                game.currentVote.cardsToChange.set(player.id, randomCards);
            }
        }
        // Process card changes for each player
        for (const [playerId, cardIds] of game.currentVote.cardsToChange.entries()) {
            const player = game.players.find(p => p.id === playerId);
            if (!player)
                continue;
            console.log(`Processing card change for ${player.name}:`, {
                selectedCards: cardIds,
                handSize: player.hand.length
            });
            // Remove selected cards from player's hand
            player.hand = player.hand.filter(card => !cardIds.includes(card.id));
            // Deal new cards
            const newCards = game.whiteCards.splice(0, cardIds.length);
            player.hand.push(...newCards);
            console.log(`Completed card change for ${player.name}:`, {
                newHandSize: player.hand.length,
                newCards: newCards.map(c => c.id)
            });
        }
        // Reset vote and restore phase
        game.currentVote = null;
        game.phase = game.previousPhase || 'playing'; // Restore previous phase
        game.previousPhase = undefined; // Clear previous phase
        console.log('Final game state:', {
            phase: game.phase,
            previousPhase: game.previousPhase,
            currentVote: game.currentVote
        });
        yield game.save();
        io.to(gameId).emit('cardsChanged');
        console.log("emited cardsChanged to game", gameId);
        io.to(gameId).emit('gameStateUpdate', game);
    }
    catch (error) {
        console.error('Error in executeCardChange:', error);
        // Emit error to clients
        io.to(gameId).emit('cardChangeError', {
            message: 'Failed to change cards'
        });
    }
});
exports.default = {
    createGame: exports.createGame,
    joinGame: exports.joinGame,
    getGameState: exports.getGameState,
    startGame: exports.startGame,
    playCard: exports.playCard,
    selectWinner: exports.selectWinner,
    rejoinGame: exports.rejoinGame,
    getCurrentPlayers: exports.getCurrentPlayers,
    deleteGame: exports.deleteGame,
    getAvailablePacks: exports.getAvailablePacks,
    updateOnlineStatus: exports.updateOnlineStatus,
    getOnlineUsers: exports.getOnlineUsers,
    addChatMessage: exports.addChatMessage,
    createCard: exports.createCard,
    editCard: exports.editCard,
    deleteCard: exports.deleteCard,
    createPack: exports.createPack,
    editPack: exports.editPack,
    deletePack: exports.deletePack,
    getCardPacks: exports.getCardPacks,
    getPackCards: exports.getPackCards,
    updatePackUsageAndRating: exports.updatePackUsageAndRating,
    rateCardPack: exports.rateCardPack,
    getSortedPacks: exports.getSortedPacks,
    // getMessagesSince,
    initiateVote: exports.initiateVote,
    submitVote: exports.submitVote,
    selectCardsToChange: exports.selectCardsToChange,
    resolveVote,
    executeCardChange
};

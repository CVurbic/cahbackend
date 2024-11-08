import { Request, Response } from 'express';
import { Server } from 'socket.io';
import Game, { IGame, IChatMessage } from '../models/Game';
import { v4 as uuidv4 } from 'uuid';
import { getCardsFromPacks, fetchAvailablePackNames } from '../utils/cardDecks';
import { shuffleArray } from '../utils/helpers';
import { BlackCard, GameState, Player, WhiteCard } from '../types/game';
import cron from 'node-cron';
import { createBot, botPlayCard, botSelectWinner } from '../utils/botPlayer';
import OpenAI from 'openai';
import dotenv from 'dotenv';
import { Card, CardPack } from '../models/Card';
import { exponentialBackoff } from '../utils/helpers';
import { Document } from 'mongoose';

// ADD REMOVE OLD FINISHED GAMES

dotenv.config();

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

let io: Server;

// Add this helper function at the top of the file
function transformMongoDocument<T extends Document>(doc: T): any {
    const transformed = doc.toObject();
    transformed.id = transformed._id;
    delete transformed._id;
    return transformed;
}

export const setIo = (socketIo: Server) => {
    io = socketIo;
};

export const createGame = async (req: Request, res: Response) => {

    try {
        const creatorId = (req as any).userId || uuidv4();
        const creatorName = (req as any).username || req.body.playerName;
        const gameId = uuidv4().substring(0, 6);
        const gameName = req.body.gameName;
        const winningScore = req.body.winningScore;
        const selectedBlackCardPacks = req.body.blackCardPacks || ['base'];
        const selectedWhiteCardPacks = req.body.whiteCardPacks || ['base'];
        const createdAt = new Date();

        console.log('Creating new game with the following settings:');
        console.log(`Game Name: ${gameName}`);
        console.log(`Creator Name: ${creatorName}`);

        // Fetch cards from MongoDB
        const blackCards = await getCardsFromPacks(selectedBlackCardPacks, 'black') as BlackCard[];

        const whiteCards = await getCardsFromPacks(selectedWhiteCardPacks, 'white') as WhiteCard[];

        const newGame: IGame = new Game({
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
            blackCards: shuffleArray(blackCards),
            whiteCards: shuffleArray(whiteCards),
            dealtWhiteCards: [],
            playedCards: {},
            winningScore,
            selectedBlackCardPacks,
            selectedWhiteCardPacks,
            createdAt: createdAt,
            onlineUsers: []
        });

        console.log('New game created with:');
        console.log(`${newGame.blackCards.length} black cards`);
        console.log(`${newGame.whiteCards.length} white cards`);

        // Add bot players
        const botCount = req.body.botCount || 0;
        for (let i = 0; i < botCount; i++) {
            const bot = createBot(`Bot ${i + 1}`);
            newGame.players.push({
                id: bot.id,
                name: bot.name,
                hand: [],
                score: 0,
                isBot: true
            });
            console.log(`Added bot ${bot.name} to game ${newGame._id}`);
        }

        await newGame.save();
        res.status(201).json({ gameId, creatorId, playerId: creatorId, createdAt: createdAt });
    } catch (error: any) {
        console.error('Error creating game:', error);
        res.status(500).json({ message: 'Error creating game', error: error.message });
    }
};

export const joinGame = async (req: Request, res: Response) => {
    try {
        const { gameId } = req.params;
        const { playerName } = req.body;

        console.log(`Attempting to join game ${gameId} with name ${playerName}`);

        const game = await Game.findById(gameId);
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
        } else if (game.players.some(player => player.name.toLowerCase() === playerName.toLowerCase())) {
            return res.status(400).json({ message: 'Player name already taken' });
        }

        const newPlayer = {
            id: uuidv4(),
            name: playerName,
            hand: [],
            score: 0,
            isBot: false
        };

        game.players.push(newPlayer);
        game.activePlayers.push(newPlayer.id); // Add to active players
        await game.save();

        console.log(`Player ${playerName} joined game ${gameId}`);
        res.status(200).json({ playerId: newPlayer.id, gameState: game });
    } catch (error: any) {
        console.error('Error joining game:', error);
        res.status(500).json({ message: 'Error joining game', error: error.message });
    }
};


export const leaveGame = async (req: Request, res: Response) => {
    try {
        const { gameId } = req.params;
        const { playerId } = req.body;

        console.log(`Attempting to remove player ${playerId} from game ${gameId}`);

        const game = await Game.findById(gameId);
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
        await game.save();

        console.log(`Player ${playerId} removed from game ${gameId}`);
        res.status(200).json({ message: 'Player successfully removed from game', gameState: game });
    } catch (error: any) {
        console.error('Leave game error:', error);
        res.status(500).json({ message: 'Internal server error', error: error.message });
    }
};

const MESSAGES_PER_PAGE = 15;

export const getGameState = async (req: Request, res: Response) => {
    try {
        const { gameId } = req.params;
        const { playerId } = req.query;

        const game = await Game.findById(gameId);
        if (!game) {
            return res.status(404).json({ message: 'Game not found' });
        }

        const gameState: GameState = {
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
            chatMessages: game.chatMessages.slice(-MESSAGES_PER_PAGE)
        };

        // Handle played cards based on game phase
        if (game.phase === 'selection' || game.phase === 'roundWinner') {
            // Show all played cards
            gameState.playedCards = Object.fromEntries(game.playedCards);
        } else if (game.phase === 'playing') {
            // Only show which players have played, not the actual cards
            gameState.playedCards = Object.fromEntries(
                Array.from(game.playedCards.entries()).map(([id, cards]) =>
                    [id, cards.map(() => ({ id: '', text: 'Card Played', type: 'white', pack: 'base' }))]
                )
            );
        } else {
            // Don't show any played cards in other phases
            gameState.playedCards = {};
        }
        res.json(gameState);
    } catch (error: any) {
        console.error('Error getting game state:', error);
        res.status(500).json({ message: 'Error getting game state', error: error.message });
    }
};


export const startGame = async (req: Request, res: Response) => {
    try {
        const { gameId } = req.params;
        const { creatorId } = req.body;
        console.log(`Attempting to start game ${gameId} by creator ${creatorId}`);

        const game = await Game.findById(gameId);
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

        // Shuffle the cards
        game.blackCards = shuffleArray(game.blackCards);
        game.whiteCards = shuffleArray(game.whiteCards);

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
        game.currentBlackCard = game.blackCards.pop() as BlackCard || null;

        await game.save();



        // Emit game state to all players
        io.to(gameId).emit('gameStateUpdate', game);

        res.status(200).json({ message: 'Game started', gameState: game });
    } catch (error: any) {
        console.error('Error starting game:', error);
        res.status(500).json({ message: 'Error starting game', error: error.message });
    }
};


export const restartGame = async (req: Request, res: Response) => {
    try {
        const { gameId } = req.params;
        const { creatorId } = req.body;

        const game = await Game.findById(gameId);

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
        game.blackCards = shuffleArray(game.blackCards);
        game.whiteCards = shuffleArray(game.whiteCards);

        // Reset player scores and hands
        game.players.forEach(player => {
            player.score = 0;
            player.hand = [];
        });

        await game.save();
        console.log(`Game ${gameId} has been restarted`);

        res.json(game);
    } catch (error) {
        console.error('Error restarting game:', error);
        res.status(500).json({ message: 'Error restarting game' });
    }
};

const rotateCardCzar = (game: IGame, winningPlayerId: string) => {
    const currentCzarIndex = game.players.findIndex(player => player.id === game.cardCzar);
    game.cardCzar = winningPlayerId;
    console.log(`New Card Czar: ${game.players.find(player => player.id === winningPlayerId)?.name} (${game.cardCzar})`);
};

export const playCard = async (req: Request, res: Response) => {
    try {
        const { gameId } = req.params;
        const { playerId, cardIds } = req.body;
        console.log(`Attempting to play card for game ${gameId}, player ${playerId}, cards ${cardIds}`);

        const game = await Game.findById(gameId);
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

        await game.save();
        console.log('Card played successfully');
        console.log('Updated playedCards:', game.playedCards);

        // Emit game state update to all players
        io.to(gameId).emit('gameStateUpdate', game);

        // Emit notification to all players except the one who played
        io.to(gameId).except(playerId).emit('notification', notification);

        // Handle bot actions
        let allBotsPlayed = false;
        while (!allBotsPlayed && game.phase === 'playing') {
            allBotsPlayed = await handleBotPlayingPhase(game);
        }

        // Check if all players have played after bot actions
        const allPlayersPlayed = game.players.every(player =>
            player.id === game.cardCzar || game.playedCards.has(player.id)
        );

        if (allPlayersPlayed && game.phase === 'playing') {
            game.phase = 'selection';
            updateShuffledPlayedCards(game);
            console.log('All players have played. Cards shuffled and moving to selection phase.');
            await game.save();
            io.to(gameId).emit('gameStateUpdate', game);

            // Trigger bot actions for the selection phase if the Card Czar is a bot
            if (game.players.find(p => p.id === game.cardCzar)?.isBot) {
                await handleBotSelectionPhase(game);
            }
        }

        res.status(200).json(game);
    } catch (error: any) {
        console.error('Error playing card:', error);
        res.status(500).json({ message: 'Error playing card', error: error.message });
    }
};

const updateShuffledPlayedCards = (game: IGame) => {
    const playedCardsArray = Array.from(game.playedCards.entries());
    const shuffledCards = shuffleArray(playedCardsArray);

    // Clear the existing playedCards and repopulate with shuffled order
    game.playedCards.clear();
    shuffledCards.forEach(([playerId, cards]) => {
        game.playedCards.set(playerId, cards);
    });

    game.markModified('playedCards');
    console.log('Shuffled and updated playedCards:', Object.fromEntries(game.playedCards));
};


const handleBotActions = async (game: IGame) => {
    switch (game.phase) {
        case 'playing':
            await handleBotPlayingPhase(game);
            break;
        case 'selection':
            await handleBotSelectionPhase(game);
            break;
        // Add more cases if needed for other phases
    }
};

async function handleBotPlayingPhase(game: IGame): Promise<boolean> {
    let allBotsPlayed = true;
    const botPlayers = game.players.filter(player => player.isBot && player.id !== game.cardCzar);

    for (const botPlayer of botPlayers) {
        if (!game.playedCards.has(botPlayer.id)) {
            try {
                await playBotCard(game, botPlayer);
            } catch (error) {
                console.error(`Error playing card for bot ${botPlayer.name}:`, error);
                allBotsPlayed = false;
            }
            // Add a delay between bot plays
            await new Promise(resolve => setTimeout(resolve, 10));
        }
    }

    // Check if all players (including humans and bots) have played
    const allPlayersPlayed = game.players.every(player =>
        player.id === game.cardCzar || game.playedCards.has(player.id)
    );

    if (allPlayersPlayed && game.phase === 'playing') {
        await transitionToSelectionPhase(game);
    }

    return allBotsPlayed;
}

async function transitionToSelectionPhase(game: IGame) {
    game.phase = 'selection';
    updateShuffledPlayedCards(game);
    console.log('All players have played. Cards shuffled and moving to selection phase.');

    const updatedGame = await Game.findOneAndUpdate(
        { _id: game._id, __v: game.__v },
        {
            $set: {
                phase: game.phase,
                playedCards: game.playedCards
            },
            $inc: { __v: 1 }
        },
        { new: true, runValidators: true }
    );

    if (!updatedGame) {
        throw new Error('Game not found or version mismatch');
    }

    io.to(game._id).emit('gameStateUpdate', updatedGame);

    // Trigger bot actions for the selection phase if the Card Czar is a bot
    if (updatedGame.players.find(p => p.id === updatedGame.cardCzar)?.isBot) {
        await handleBotSelectionPhase(updatedGame);
    }
}

async function playBotCard(game: IGame, botPlayer: Player): Promise<void> {
    const playedCards = botPlayCard(game, botPlayer.id);
    if (!playedCards) {
        throw new Error(`Bot ${botPlayer.name} failed to play a card`);
    }

    const maxRetries = 5;
    const baseDelay = 10; // 10ms

    await exponentialBackoff(async (attempt) => {
        const updatedGame = await Game.findOneAndUpdate(
            {
                _id: game._id,
                __v: game.__v,
                [`playedCards.${botPlayer.id}`]: { $exists: false } // Ensure the bot hasn't played yet
            },
            {
                $set: { [`playedCards.${botPlayer.id}`]: playedCards },
                $inc: { __v: 1 }
            },
            { new: true, runValidators: true }
        );

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

    }, maxRetries, baseDelay);
}

const handleBotSelectionPhase = async (game: IGame) => {
    if (game.players.find(p => p.id === game.cardCzar)?.isBot) {
        console.log(`Bot Card Czar ${game.cardCzar} is revealing cards`);

        await revealAllCardsForBot(game);
        await new Promise(resolve => setTimeout(resolve, 3000));

        console.log("Starting AI-based winner selection...");
        const result = await botSelectWinnerWithAI(game);
        if (result) {
            console.log(`AI selected winner: ${result.winningPlayerId}`);
            console.log(`Reason: ${result.reason}`);
            // Add a delay before selecting the winner
            await new Promise(resolve => setTimeout(resolve, Math.random() * 200 + 100)); // 1-3 seconds delay
            await handleBotSelectWinner(game, result.winningPlayerId, result.reason);
        } else {
            console.log("AI failed to select a winner. Falling back to random selection.");
            const randomWinner = botSelectWinner(game);
            if (randomWinner) {
                // Add a delay before selecting the winner
                await new Promise(resolve => setTimeout(resolve, Math.random() * 200 + 100)); // 1-3 seconds delay
                await handleBotSelectWinner(game, randomWinner, "Random selection.");
            }
        }
    }
};



const botSelectWinnerWithAI = async (game: IGame): Promise<{ winningPlayerId: string, reason: string } | null> => {
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
        const response = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [{ role: "user", content: prompt }],
            max_tokens: 100,
            temperature: 0.7,
        });

        console.log("Received response from OpenAI:", response.choices[0].message.content);

        const aiResponse = response.choices[0].message.content?.trim() || "";
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
    } catch (error) {
        console.error('Error using OpenAI API:', error);
        console.log('Falling back to random selection');
        const randomIndex = Math.floor(Math.random() * playerIds.length);
        return {
            winningPlayerId: playerIds[randomIndex],
            reason: "Random selection due to API error."
        };
    }
};


const revealAllCardsForBot = async (game: IGame) => {
    const unrevealedPlayerIds = [...game.playedCards.keys()].filter(id => !game.revealedCards.includes(id));

    for (const playerId of unrevealedPlayerIds) {
        game.revealedCards.push(playerId);
        game.markModified('revealedCards');
        await game.save();

        // Emit game state update after each card reveal
        io.to(game._id).emit('gameStateUpdate', game);



        console.log(`Bot revealed card for player ${playerId}`);

        // Wait for 1 second before revealing the next card
        await new Promise(resolve => setTimeout(resolve, 1000));
    }

    console.log('All cards have been revealed by the bot Card Czar');
};

const handleBotSelectWinner = async (game: IGame, winningPlayerId: string, reason: string) => {
    const winningPlayer = game.players.find(p => p.id === winningPlayerId);
    if (winningPlayer) {
        winningPlayer.score += 1;
        game.phase = 'roundWinner';
        game.lastWinner = winningPlayer.name;
        game.lastWinningCard = game.playedCards.get(winningPlayerId)?.[0] || null;
        game.lastWinningReason = reason; // Add this field to your IGame interface
        console.log(`Winner selected in game ${game._id}: ${winningPlayer.name}`);

        if (winningPlayer.score >= game.winningScore) {
            game.phase = 'gameOver';
            game.winner = winningPlayer.id;
            console.log(`Game ${game._id} over. Winner: ${winningPlayer.name}`);
        }

        await game.save();

        // Emit notification for winner selection
        const notification = {
            title: 'Winner Selected',
            message: `${game.players.find(p => p.id === game.cardCzar)?.name} (Card Czar) has selected ${winningPlayer.name} as the winner! DICK`,
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
        setTimeout(async () => {
            await startNextRound(game);
        }, 5000);
    }
};



export const selectWinner = async (req: Request, res: Response) => {
    try {
        const { gameId } = req.params;
        const { winningPlayerId } = req.body;

        const game = await Game.findById(gameId);
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
        game.lastWinningCard = game.playedCards.get(winningPlayerId)?.[0] || null;

        // Change phase to 'roundWinner
        game.phase = 'roundWinner';

        await game.save();

        // Emit the updated game state
        io.to(gameId).emit('gameStateUpdate', game);

        // Set a timeout to start the next round
        setTimeout(async () => {
            await startNextRound(game);
        }, 5000); // Wait for 5 seconds before starting the next round

        res.status(200).json(game);
    } catch (error: any) {
        console.error('Error selecting winner:', error);
        res.status(500).json({ message: 'Error selecting winner', error: error.message });
    }
};

const startNextRound = async (game: IGame) => {
    let retries = 3;
    while (retries > 0) {
        try {
            if (game.phase !== 'roundWinner') {
                console.log('Game is not in roundWinner phase. Skipping next round start.');
                return;
            }

            const winningPlayer = game.players.find(p => p.name === game.lastWinner);
            if (winningPlayer && winningPlayer.score >= game.winningScore) {
                game.phase = 'gameOver';
                game.winner = winningPlayer.id;
            } else {
                game.round += 1;
                game.phase = 'playing';
                game.revealedCards = [];
                game.playedCards.clear();
                game.currentBlackCard = game.blackCards.pop() as BlackCard || null;

                // Rotate Card Czar
                rotateCardCzar(game, winningPlayer?.id || '');

                // Deal new cards to all players
                game.players.forEach(player => {
                    const cardsNeeded = 10 - player.hand.length;
                    player.hand.push(...game.whiteCards.splice(0, cardsNeeded));
                });
            }

            // Use findOneAndUpdate with optimistic concurrency control
            const updatedGame = await Game.findOneAndUpdate(
                { _id: game._id, __v: game.__v },
                {
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
                },
                { new: true, runValidators: true }
            );

            if (!updatedGame) {
                throw new Error('Game not found or version mismatch');
            }

            // Emit the updated game state
            io.to(game._id).emit('gameStateUpdate', updatedGame);

            // Emit notification for new round
            const notification = {
                title: 'New Round',
                message: `Round ${updatedGame.round} has started. ${updatedGame.players.find(p => p.id === updatedGame.cardCzar)?.name} is the new Card Czar.`
            };
            io.to(game._id).emit('notification', notification);

            // Handle bot actions for the new round
            if (updatedGame.phase === 'playing') {
                // Add a small delay before bots start playing
                setTimeout(async () => {
                    await handleBotActions(updatedGame);
                }, 2000);
            }

            return; // Success, exit the retry loop
        } catch (error) {
            console.error('Error starting next round:', error);
            retries--;
            if (retries === 0) {
                console.error('Failed to start next round after multiple attempts');
                throw error;
            }
            // Fetch the latest version of the game before retrying
            game = await Game.findById(game._id) as IGame;
        }
    }
};


export const rejoinGame = async (req: Request, res: Response) => {
    try {
        const { gameId } = req.params;
        const { playerId, playerName } = req.body;

        const game = await Game.findById(gameId);
        if (!game) {
            return res.status(404).json({ message: 'Game not found' });
        }

        const existingPlayer = game.players.find(p => p.id === playerId && p.name === playerName);
        if (!existingPlayer) {
            return res.status(404).json({ message: 'Player not found in this game' });
        }

        // Player successfully rejoined
        res.status(200).json({ message: 'Successfully rejoined the game', gameState: game });
    } catch (error: any) {
        console.error('Error rejoining game:', error);
        res.status(500).json({ message: 'Error rejoining game', error: error.message });
    }
};

export const getCurrentPlayers = async (req: Request, res: Response) => {
    try {
        // Fetch current games logic here
        const games = await Game.find({}, '_id players phase creatorId createdAt gameName');

        const currentGames = games.map(game => ({
            gameId: game._id,
            gameName: game.gameName,
            creatorName: game.players.find(player => player.id === game.creatorId)?.name || game.creatorId,
            players: game.players.map(player => player.name),
            playerCount: game.players.length,
            phase: game.phase,
            creatorId: game.creatorId,
            createdAt: game.createdAt
        }));

        res.status(200).json({ message: 'Games found', games: currentGames });
    } catch (error) {
        console.error('Error fetching current games:', error);
        res.status(500).json({ message: 'Error fetching current games' });
    }
};


export const revealCard = async (req: Request, res: Response) => {
    console.log('revealCard function called');
    try {
        const { gameId } = req.params;
        const { playerId } = req.body;
        console.log(`Revealing card for game ${gameId}, player ${playerId}`);

        let game = await Game.findById(gameId);
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
        await game.save();

        // Emit socket event for real-time update
        io.to(gameId).emit('cardRevealed', { gameId, revealedPlayerId: playerIdToReveal });

        console.log('Game saved successfully after revealing card');

        res.status(200).json({
            message: 'Card revealed successfully',
            revealedPlayerId: playerIdToReveal
        });
    } catch (error) {
        console.error('Error revealing card:', error);
        res.status(500).json({ message: 'Error revealing card' });
    }
};

export const deleteGame = async (req: Request, res: Response) => {
    try {
        const { gameId } = req.params;
        const { creatorId } = req.body;

        const game = await Game.findById(gameId);

        if (!game) {
            return res.status(404).json({ message: 'Game not found' });
        }

        if (game.creatorId !== creatorId) {
            return res.status(403).json({ message: 'Only the game creator can delete the game' });
        }

        await Game.findByIdAndDelete(gameId);
        console.log(`Game ${gameId} has been deleted`);

        res.status(200).json({ message: 'Game successfully deleted' });
    } catch (error) {
        console.error('Error deleting game:', error);
        res.status(500).json({ message: 'Error deleting game' });
    }
};

export const deleteFinishedInactiveGames = async () => {
    try {
        const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000);
        console.log('Checking for finished and inactive games last updated before:', threeHoursAgo);

        const result = await Game.deleteMany({
            $or: [
                { phase: 'gameOver' },
                { activePlayers: { $size: 0 } }
            ],
            updatedAt: { $lt: threeHoursAgo }
        });

        console.log(`Deleted ${result.deletedCount} finished and inactive games`);
    } catch (error) {
        console.error('Error deleting finished and inactive games:', error);
    }
};

// Set up a cron job to run every minute
cron.schedule('0 * * * *', () => {
    console.log('Running scheduled task to delete finished and inactive games');
    deleteFinishedInactiveGames();
});


export const getAvailablePacks = async (req: Request, res: Response) => {
    try {
        const packs = await CardPack.find()
            .populate('createdBy', 'username');

        const cardCounts = await Card.aggregate([
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
            const counts = cardCountMap.get((pack._id as any).toString()) || { blackCardCount: 0, whiteCardCount: 0 };
            return {
                ...transformMongoDocument(pack),
                createdBy: pack.createdBy && 'username' in pack.createdBy ? pack.createdBy.username : 'Unknown',
                blackCardCount: counts.blackCardCount,
                whiteCardCount: counts.whiteCardCount
            };
        });


        res.json({ availablePacks: transformedPacks });
    } catch (error: any) {
        console.error('Error fetching available packs:', error);
        res.status(500).json({ message: 'Error fetching available packs', error: error.message });
    }
};

// Add this function to update online status
export const updateOnlineStatus = async (req: Request, res: Response) => {
    const { gameId } = req.params;
    const { playerId, isOnline } = req.body;
    try {

        console.log(`Updating online status for game ${gameId}, player ${playerId}, isOnline: ${isOnline}`);

        const game = await Game.findById(gameId);
        if (!game) {
            console.log(`Game ${gameId} not found`);
            return res.status(404).json({ message: 'Game not found' });
        }

        if (isOnline) {
            if (!game.onlineUsers.includes(playerId)) {
                game.onlineUsers.push(playerId);
                console.log(`Player ${playerId} is now online in game ${gameId}`);
            }
        } else {
            game.onlineUsers = game.onlineUsers.filter(id => id !== playerId);
            console.log(`Player ${playerId} is now offline in game ${gameId}`);
        }

        await game.save();

        console.log(`Current online users in game ${gameId}:`, game.onlineUsers);

        // Emit updated online users to all players in the game
        io.to(gameId).emit('onlineUsersUpdate', game.onlineUsers);

        res.status(200).json({ message: 'Online status updated', onlineUsers: game.onlineUsers });
    } catch (error: any) {
        console.error('Error updating online status:', error);
        res.status(500).json({ message: 'Error updating online status', error: error.message });
    }
};

// Add this function to get online users
export const getOnlineUsers = async (req: Request, res: Response) => {
    try {
        const { gameId } = req.params;

        const game = await Game.findById(gameId);
        if (!game) {
            console.log(`Game ${gameId} not found`);
            return res.status(404).json({ message: 'Game not found' });
        }

        const onlineUsers = game.players.filter(player => game.onlineUsers.includes(player.id));

        console.log(`Online users in game ${gameId}:`, onlineUsers.map(user => user.name));

        res.status(200).json({ onlineUsers: onlineUsers.map(user => ({ id: user.id, name: user.name })) });
    } catch (error: any) {
        console.error('Error getting online users:', error);
        res.status(500).json({ message: 'Error getting online users', error: error.message });
    }
};

export const addChatMessage = async (
    gameId: string,
    sender: string,
    content: string,
    isSystemMessage: boolean = false
) => {
    try {
        const game = await Game.findById(gameId);
        if (!game) {
            throw new Error('Game not found');
        }

        const newMessage: IChatMessage = {
            sender,
            content,
            timestamp: new Date(),
            isSystemMessage,
            gameId
        };

        game.chatMessages.push(newMessage);
        await game.save();

        // Emit the new message to all players in the game
        io.to(gameId).emit('chat message', newMessage);

        return newMessage;
    } catch (error: any) {
        console.error('Error adding chat message:', error);
        throw error;
    }
};



export const getOlderMessages = async (req: Request, res: Response) => {
    try {
        const { gameId } = req.params;
        const { page = 1 } = req.query;

        const game = await Game.findById(gameId);
        if (!game) {
            return res.status(404).json({ message: 'Game not found' });
        }

        const pageNumber = parseInt(page as string, 10);
        const startIndex = game.chatMessages.length - (pageNumber * MESSAGES_PER_PAGE);
        const endIndex = startIndex + MESSAGES_PER_PAGE;

        const olderMessages = game.chatMessages.slice(Math.max(0, startIndex), endIndex);

        res.json({ messages: olderMessages, hasMore: startIndex > 0 });
    } catch (error: any) {
        console.error('Error getting older messages:', error);
        res.status(500).json({ message: 'Error getting older messages', error: error.message });
    }
};

export const createCard = async (req: Request, res: Response) => {
    try {
        const { text, type, pack, blanks } = req.body;
        const createdBy = (req as any).userId;

        const cardPack = await CardPack.findById(pack);
        if (!cardPack) {
            return res.status(404).json({ message: 'Card pack not found' });
        }

        if (cardPack.isOriginal) {
            return res.status(403).json({ message: 'Cannot add cards to original packs' });
        }

        if (cardPack.createdBy && cardPack.createdBy.toString() !== createdBy) {
            return res.status(403).json({ message: 'You do not have permission to add cards to this pack' });
        }

        const newCard = new Card({
            text,
            type,
            pack,
            blanks: type === 'black' ? blanks : undefined,
            createdBy,
            createdAt: new Date()
        });
        await newCard.save();
        res.status(201).json(transformMongoDocument(newCard));
    } catch (error) {
        res.status(400).json({ message: 'Error creating card', error });
    }
};

export const editCard = async (req: Request, res: Response) => {
    try {
        const { cardId } = req.params;
        const { text, blanks } = req.body;
        const userId = (req as any).userId;

        const card = await Card.findById(cardId).populate('pack');
        if (!card) {
            return res.status(404).json({ message: 'Card not found' });
        }

        if ((card.pack as any).isOriginal) {
            return res.status(403).json({ message: 'Cannot edit cards in original packs' });
        }

        if (card.createdBy && card.createdBy.toString() !== userId) {
            return res.status(403).json({ message: 'You do not have permission to edit this card' });
        }

        const updatedCard = await Card.findByIdAndUpdate(cardId, { text, blanks }, { new: true });
        if (!updatedCard) {
            return res.status(404).json({ message: 'Card not found' });
        }
        res.json(transformMongoDocument(updatedCard));
    } catch (error) {
        res.status(400).json({ message: 'Error updating card', error });
    }
};

export const deleteCard = async (req: Request, res: Response) => {
    try {
        const { cardId } = req.params;
        const userId = (req as any).userId;

        const card = await Card.findById(cardId).populate('pack');
        if (!card) {
            return res.status(404).json({ message: 'Card not found' });
        }

        if ((card.pack as any).isOriginal) {
            return res.status(403).json({ message: 'Cannot delete cards from original packs' });
        }

        if (card.createdBy && card.createdBy.toString() !== userId) {
            return res.status(403).json({ message: 'You do not have permission to delete this card' });
        }

        await Card.findByIdAndDelete(cardId);
        res.json({ message: 'Card deleted successfully' });
    } catch (error) {
        res.status(400).json({ message: 'Error deleting card', error });
    }
};

export const createPack = async (req: Request, res: Response) => {
    try {
        const { name, isPublic, imageUrl } = req.body;
        const createdBy = (req as any).userId;

        console.log('CreatePack - Request details:', {
            body: req.body,
            headers: req.headers,
            userId: createdBy,
            auth: {
                isAuthenticated: (req as any).isAuthenticated,
                username: (req as any).username
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

        const newPack = new CardPack({
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

        const savedPack = await newPack.save();
        console.log('CreatePack - Pack saved successfully:', savedPack);

        res.status(201).json(transformMongoDocument(savedPack));
    } catch (error: any) {
        console.error('CreatePack - Error:', error);
        res.status(400).json({ message: 'Error creating pack', error: error.message });
    }
};

export const editPack = async (req: Request, res: Response) => {
    try {
        const { packId } = req.params;
        const { name, isPublic } = req.body;
        const userId = (req as any).userId;

        const pack = await CardPack.findById(packId);
        if (!pack) {
            return res.status(404).json({ message: 'Pack not found' });
        }

        if (pack.isOriginal) {
            return res.status(403).json({ message: 'Cannot edit original packs' });
        }

        if (pack.createdBy.toString() !== userId) {
            return res.status(403).json({ message: 'You do not have permission to edit this pack' });
        }

        const updatedPack = await CardPack.findByIdAndUpdate(
            packId,
            { name, isPublic },
            { new: true }
        );
        if (!updatedPack) {
            return res.status(404).json({ message: 'Pack not found' });
        }
        res.json(transformMongoDocument(updatedPack));
    } catch (error: any) {
        res.status(400).json({ message: 'Error updating pack', error: error.message });
    }
};

export const deletePack = async (req: Request, res: Response) => {
    try {
        const { packId } = req.params;
        const userId = (req as any).userId;

        const pack = await CardPack.findById(packId);
        if (!pack) {
            return res.status(404).json({ message: 'Pack not found' });
        }

        if (pack.isOriginal) {
            return res.status(403).json({ message: 'Cannot delete original packs' });
        }

        if (pack.createdBy.toString() !== userId) {
            return res.status(403).json({ message: 'You do not have permission to delete this pack' });
        }

        await CardPack.findByIdAndDelete(packId);
        // Also delete all cards associated with this pack
        await Card.deleteMany({ pack: packId });
        res.json({ message: 'Pack and associated cards deleted successfully' });
    } catch (error: any) {
        res.status(400).json({ message: 'Error deleting pack', error: error.message });
    }
};

export const getCardPacks = async (req: Request, res: Response) => {
    try {
        const userId = (req as any).userId;
        const packs = await CardPack.find({
            $or: [
                { isPublic: true },
                { createdBy: userId }
            ]
        }).populate('cards');

        const packsWithCards = packs.map(pack => ({
            ...pack.toObject(),
            // cards: pack.cards.map(card => transformMongoDocument(card))
        }));

        res.json(packsWithCards);
    } catch (error) {
        res.status(400).json({ message: 'Error fetching packs', error });
    }
};

export const getPackCards = async (req: Request, res: Response) => {
    try {
        const { packId } = req.params;
        const { sortOrder = 'desc' } = req.query;

        const cards = await Card.find({ pack: packId })
            .sort({ createdAt: sortOrder === 'asc' ? 1 : -1 });

        // Transform the cards before sending
        const transformedCards = cards.map(card => transformMongoDocument(card));

        res.json(transformedCards);
    } catch (error: any) {
        console.error('Error fetching pack cards:', error);
        res.status(500).json({ message: 'Error fetching pack cards', error: error.message });
    }
};

// Add a new function for authenticated-only features
export const getPlayerStats = async (req: Request, res: Response) => {
    if ((req as any).isAnonymous) {
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
    } catch (error: any) {
        console.error('Error fetching player stats:', error);
        res.status(500).json({ message: 'Error fetching player stats', error: error.message });
    }
};

// Add this function to update pack usage and rating
export const updatePackUsageAndRating = async (packId: string, rating: number) => {
    try {
        const pack = await CardPack.findById(packId);
        if (pack) {
            pack.usageCount += 1;
            pack.rating = ((pack.rating * (pack.usageCount - 1)) + rating) / pack.usageCount;
            await pack.save();
        }
    } catch (error: any) {
        console.error('Error updating pack usage and rating:', error);
    }
};

export default {
    createGame,
    joinGame,
    getGameState,
    startGame,
    playCard,
    selectWinner,
    rejoinGame,
    getCurrentPlayers,
    deleteGame,
    getAvailablePacks,
    updateOnlineStatus,
    getOnlineUsers,
    addChatMessage,
    createCard,
    editCard,
    deleteCard,
    createPack,
    editPack,
    deletePack,
    getCardPacks,
    getPackCards,
    updatePackUsageAndRating
};

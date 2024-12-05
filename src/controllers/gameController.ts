import { Request, Response } from 'express';
import { Server } from 'socket.io';
import Game, { IGame, IChatMessage, Vote } from '../models/Game';
import { v4 as uuidv4 } from 'uuid';
import { getCardsFromPacks, fetchAvailablePackNames } from '../utils/cardDecks';
import { shuffleArray } from '../utils/helpers';
import { BlackCard, GameState, Player, WhiteCard } from '../types/game';
import cron from 'node-cron';
import { createBot, botPlayCard, botSelectWinner, botHandleVote, botSelectCardsToChange } from '../utils/botPlayer';
import OpenAI from 'openai';
import dotenv from 'dotenv';
import { Card, CardPack } from '../models/Card';
import { exponentialBackoff } from '../utils/helpers';
import { Document } from 'mongoose';
import mongoose from 'mongoose';



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


        const selectedBlackCardPacks = req.body.blackCardPacks;
        const selectedWhiteCardPacks = req.body.whiteCardPacks;

        // Extract just the pack IDs from the request
        const selectedBlackCardPacksIDs = selectedBlackCardPacks.map((pack: any) => pack.id || pack);
        const selectedWhiteCardPacksIDs = selectedWhiteCardPacks.map((pack: any) => pack.id || pack);
        const createdAt = new Date();

        console.log('Creating new game with the following settings:');
        console.log(`Game Name: ${gameName}`);
        console.log(`Creator Name: ${creatorName}`);
        console.log('Selected Black Card Packs:', selectedBlackCardPacksIDs);
        console.log('Selected White Card Packs:', selectedWhiteCardPacksIDs);

        // Fetch cards from MongoDB using pack IDs
        const blackCards = await getCardsFromPacks(selectedBlackCardPacksIDs, 'black') as BlackCard[];
        const whiteCards = await getCardsFromPacks(selectedWhiteCardPacksIDs, 'white') as WhiteCard[];

        if (!blackCards.length || !whiteCards.length) {
            return res.status(400).json({
                message: 'Unable to create game: No cards available from selected packs'
            });
        }

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

        // Update usage count for selected packs when game starts
        const uniquePackIds = new Set([
            ...game.selectedBlackCardPacksIDs,
            ...game.selectedWhiteCardPacksIDs
        ]);

        // First ensure all packs have numeric usageCount
        await CardPack.updateMany(
            {
                _id: { $in: Array.from(uniquePackIds) },
                $or: [
                    { usageCount: null },
                    { usageCount: { $exists: false } }
                ]
            },
            { $set: { usageCount: 0 } }
        );

        // Then increment the usage count
        await CardPack.updateMany(
            { _id: { $in: Array.from(uniquePackIds) } },
            [
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
            ]
        );

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

        // Add this new section to handle bot plays if Card Czar is human
        const cardCzarIsHuman = !game.players.find(p => p.id === game.cardCzar)?.isBot;
        if (cardCzarIsHuman) {
            // Add a small delay to ensure game state is properly initialized
            setTimeout(async () => {
                await handleBotPlayingPhase(game);
            }, 1000);
        }

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
    const botPlayers = game.players.filter(player =>
        player.isBot && // is a bot
        player.id !== game.cardCzar && // not the Card Czar
        !game.playedCards.has(player.id) // hasn't played yet
    );

    // Check if any human players need to play (excluding Card Czar)
    const humanPlayersToPlay = game.players.filter(player =>
        !player.isBot && // is human
        player.id !== game.cardCzar && // not the Card Czar
        !game.playedCards.has(player.id) // hasn't played yet
    );

    // If there are no human players that need to play, proceed with bot plays
    if (humanPlayersToPlay.length === 0) {
        for (const botPlayer of botPlayers) {
            try {
                await playBotCard(game, botPlayer);
            } catch (error) {
                console.error(`Error playing card for bot ${botPlayer.name}:`, error);
                allBotsPlayed = false;
            }
            // Add a delay between bot plays
            await new Promise(resolve => setTimeout(resolve, 10));
        }

        // Check if all players (including humans and bots) have played
        const allPlayersPlayed = game.players.every(player =>
            player.id === game.cardCzar || game.playedCards.has(player.id)
        );

        if (allPlayersPlayed && game.phase === 'playing') {
            await transitionToSelectionPhase(game);
        }
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

        // If there's a passed vote waiting for card selection, don't clear it
        if (game.currentVote?.status !== 'selecting') {
            game.currentVote = null;
        }

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
    try {
        if (game.phase !== 'roundWinner') {
            console.log('Game is not in roundWinner phase. Skipping next round start.');
            return;
        }

        // If there's a vote in selecting status, don't start the next round
        if (game.currentVote?.status === 'selecting') {
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
        } else {
            // Check if there's a passed vote that needs to be executed
            if (game.currentVote?.status === 'passed') {
                game.currentVote.status = 'selecting';
                await game.save();

                // Emit event to trigger card selection
                io.to(game._id).emit('gameStateUpdate', game);

                // Wait for card selection before proceeding
                return;
            }

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
        if (game.phase === 'playing') {
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
        }

        return; // Success, exit the retry loop
    } catch (error) {
        console.error('Error starting next round:', error);
        throw error;
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

interface ChatMessageWithId extends IChatMessage {
    id: string;
}

export const addChatMessage = async (
    gameId: string,
    sender: string,
    content: string,
    isSystemMessage: boolean = false
) => {
    try {
        const messageId = new mongoose.Types.ObjectId().toString();
        const message = {
            _id: messageId,
            sender,
            content,
            timestamp: new Date(),
            isSystemMessage,
            gameId
        };

        const game = await Game.findByIdAndUpdate(
            gameId,
            { $push: { chatMessages: message } },
            { new: true }
        );

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
    } catch (error) {
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
        const userId = (req as any).body.userId;
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

// Add these new interfaces at the top with other interfaces
interface PackRating {
    packId: string;
    rating: number;
}

interface SortOptions {
    sortBy: 'rating' | 'usageCount' | 'createdAt';
    order: 'asc' | 'desc';
}

// Add these new controller functions

export const rateCardPack = async (req: Request, res: Response) => {
    try {
        const { packId } = req.params;
        const { rating, cardType } = req.body; // Add cardType to specify which type is being rated

        if (rating < 1 || rating > 5) {
            return res.status(400).json({ message: 'Rating must be between 1 and 5' });
        }

        if (!['black', 'white', 'both'].includes(cardType)) {
            return res.status(400).json({ message: 'Invalid card type specified' });
        }

        const pack = await CardPack.findById(packId);
        if (!pack) {
            return res.status(404).json({ message: 'Pack not found' });
        }

        // Update the appropriate rating based on card type
        const updateData: any = {};

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
        const weightedRating = (
            ((updateData.blackCardRating || pack.blackCardRating) * (updateData.blackCardUsage || pack.blackCardUsage)) +
            ((updateData.whiteCardRating || pack.whiteCardRating) * (updateData.whiteCardUsage || pack.whiteCardUsage))
        ) / totalUsage;

        updateData.rating = Number(weightedRating.toFixed(2));

        const updatedPack = await CardPack.findByIdAndUpdate(
            packId,
            { $set: updateData },
            { new: true }
        );

        res.json({
            message: 'Rating submitted successfully',
            pack: updatedPack
        });
    } catch (error: any) {
        console.error('Error rating pack:', error);
        res.status(500).json({ message: 'Error submitting rating', error: error.message });
    }
};

export const getSortedPacks = async (req: Request, res: Response) => {
    try {
        const { sortBy = 'rating', order = 'desc' } = req.query as unknown as SortOptions;
        const userId = (req as any).userId;

        const sortOptions: { [key: string]: 1 | -1 } = {
            [sortBy]: order === 'desc' ? -1 : 1
        };

        const packs = await CardPack.find({
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
            createdBy: (pack.createdBy as any).username || 'Unknown',
            imageUrl: pack.imageUrl
        }));

        res.json({ packs: transformedPacks });
    } catch (error: any) {
        console.error('Error fetching sorted packs:', error);
        res.status(500).json({ message: 'Error fetching packs', error: error.message });
    }
};

export const getMessagesSince = async (gameId: string, timestamp: Date) => {
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
};

export const initiateVote = async (req: Request, res: Response) => {
    try {
        const { gameId } = req.params;
        const { playerId, cardCount } = req.body;
        console.log('Initiating vote:', { gameId, playerId, cardCount });

        const game = await Game.findById(gameId);
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

        const newVote: Vote = {
            id: new mongoose.Types.ObjectId().toString(),
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

        await game.save();
        io.to(gameId).emit('gameStateUpdate', game);

        io.to(gameId).emit('voteInitiated', { vote: newVote });



        console.log('Initial vote state:', {
            id: newVote.id,
            votes: newVote.votes,
            initiator: newVote.initiator
        });

        game.currentVote = newVote;
        await game.save();

        // Handle bot votes
        setTimeout(async () => {
            try {
                const updatedGame = await Game.findById(gameId);
                if (!updatedGame) {
                    console.error('Game not found during bot voting');
                    return;
                }

                const botPlayers = updatedGame.players.filter(p => p.isBot && p.id !== updatedGame.currentVote?.initiator);
                console.log('Bot players about to vote:', botPlayers.map(b => ({ id: b.id, name: b.name })));

                for (const bot of botPlayers) {
                    try {
                        const botVote = botHandleVote(updatedGame, bot.id);
                        console.log('Before bot vote update:', {
                            botId: bot.id,
                            botName: bot.name,
                            currentVotes: updatedGame.currentVote?.votes,
                            botVoteDecision: botVote
                        });

                        // Find and update the game document atomically
                        const gameAfterVote = await Game.findOneAndUpdate(
                            {
                                _id: gameId,
                                'currentVote.id': updatedGame.currentVote?.id
                            },
                            {
                                $set: {
                                    [`currentVote.votes.${bot.id}`]: botVote
                                }
                            },
                            { new: true }
                        );

                        if (!gameAfterVote) {
                            console.error('Failed to update game with bot vote');
                            continue;
                        }

                        console.log('After bot vote update:', {
                            votes: gameAfterVote.currentVote?.votes,
                            totalVotes: gameAfterVote.currentVote?.votes ?
                                Object.keys(gameAfterVote.currentVote.votes).length : 0
                        });

                        // Emit vote update
                        if (gameAfterVote.currentVote) {
                            const voteForEmit = {
                                ...gameAfterVote.currentVote,
                                votes: gameAfterVote.currentVote.votes instanceof Map ?
                                    Object.fromEntries(gameAfterVote.currentVote.votes) :
                                    gameAfterVote.currentVote.votes
                            };

                            io.to(gameId).emit('voteUpdated', voteForEmit);

                            // Check if all players have voted and resolve immediately if they have
                            const totalVotes = Object.keys(gameAfterVote.currentVote.votes).length;
                            if (totalVotes === gameAfterVote.players.length) {
                                console.log('All players (including bots) have voted - resolving vote immediately');
                                await resolveVote(gameId);
                                break; // Exit the loop since we've resolved the vote
                            }
                        }

                        // Add a small delay between bot votes if we haven't resolved yet
                        await new Promise(resolve => setTimeout(resolve, 500));

                    } catch (error) {
                        console.error(`Error processing bot vote for ${bot.name}:`, error);
                    }
                }
            } catch (error) {
                console.error('Error in bot voting timeout:', error);
            }
        }, 3000);

        res.status(200).json({ vote: newVote });
    } catch (error: any) {
        console.error('Error initiating vote:', error);
        res.status(500).json({ message: 'Error initiating vote', error: error.message });
    }
};

export const submitVote = async (req: Request, res: Response) => {
    try {
        const { gameId } = req.params;
        const { playerId, vote } = req.body;

        const updatedGame = await Game.findOneAndUpdate(
            {
                _id: gameId,
                'currentVote.status': 'active'
            },
            {
                $set: { [`currentVote.votes.${playerId}`]: vote }
            },
            { new: true }
        );

        if (!updatedGame) {
            return res.status(404).json({ message: 'Game not found or vote is no longer active' });
        }

        // Emit vote update
        if (updatedGame.currentVote) {
            const voteForEmit = {
                ...updatedGame.currentVote,
                votes: updatedGame.currentVote.votes instanceof Map ?
                    Object.fromEntries(updatedGame.currentVote.votes) :
                    updatedGame.currentVote.votes
            };

            io.to(gameId).emit('voteUpdated', voteForEmit);

            // Check if all players have voted and resolve immediately if they have
            console.log('Checking if all players have voted:', {
                votes: updatedGame.currentVote.votes,
                players: updatedGame.players
            });
            const totalVotes = Object.keys(updatedGame.currentVote.votes).length;
            if (totalVotes === updatedGame.players.length) {
                console.log('All players (including bots) have voted - resolving vote immediately');
                await resolveVote(gameId);
            }
        }

        res.status(200).json({ message: 'Vote submitted successfully' });
    } catch (error: any) {
        console.error('Error submitting vote:', error);
        res.status(500).json({ message: 'Error submitting vote', error: error.message });
    }
};

export const selectCardsToChange = async (req: Request, res: Response) => {
    try {
        const { gameId } = req.params;
        const { playerId, cardIds } = req.body;



        const game = await Game.findById(gameId);


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
        await game.save();



        // Update the player selection check
        const allPlayersSelected = game.players.every(player =>
            game.currentVote?.cardsToChange.get(player.id)?.length === game.currentVote?.cardCount
        );


        if (allPlayersSelected) {
            console.log('All players have selected cards - executing card change');
            await executeCardChange(gameId);
        }



        res.status(200).json({ message: 'Cards selected successfully' });
    } catch (error: any) {
        console.error('Error in selectCardsToChange:', {
            error: error.message,
            stack: error.stack,
            timestamp: new Date().toISOString()
        });
        res.status(500).json({ message: 'Error selecting cards', error: error.message });
    }
};

const resolveVote = async (gameId: string) => {
    const game = await Game.findById(gameId);
    if (!game || !game.currentVote) {
        return;
    }

    // Get total number of votes cast
    const totalVotesCast = Object.keys(game.currentVote.votes).length;
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

    const agreeingPlayers = Object.values(game.currentVote.votes).filter(vote => vote === true).length;
    const passed = agreeingPlayers > totalPlayers / 2;

    console.log('Vote resolution:', {
        vote: game.currentVote,
        passed,
        agreeingPlayers,
        totalPlayers,
        votes: game.currentVote.votes,
        allVotesCast: true
    });

    game.currentVote.status = passed ? 'passed' : 'failed';

    if (passed) {
        game.lastVoteRound = game.round;
        game.usedVotes.push(game.currentVote.initiator);

        // Store the CURRENT phase before changing to voting
        if (!game.previousPhase) {  // Only store if not already stored
            game.previousPhase = game.phase;
        }
        game.phase = 'voting';
    }

    await game.save();

    // Emit vote resolution
    io.to(gameId).emit('voteResolved', {
        passed,
        vote: game.currentVote
    });

    if (passed) {
        // Wait for 3 seconds to show the result, then change to selecting state
        setTimeout(async () => {
            const updatedGame = await Game.findById(gameId);
            if (!updatedGame || !updatedGame.currentVote) return;

            // Only proceed if we're still in the same vote
            if (updatedGame.currentVote.id === game.currentVote?.id) {
                updatedGame.currentVote.status = 'selecting';
                await updatedGame.save();
                io.to(gameId).emit('gameStateUpdate', updatedGame);
            }
        }, 3000);
    } else {
        // Show failed result for 3 seconds then clear the vote and return to previous phase
        setTimeout(async () => {
            const updatedGame = await Game.findById(gameId);
            if (updatedGame && updatedGame.currentVote?.id === game.currentVote?.id) {
                updatedGame.currentVote = null;
                if (updatedGame.phase === 'voting') {
                    updatedGame.phase = updatedGame.previousPhase || 'playing';
                    updatedGame.previousPhase = undefined;
                }
                await updatedGame.save();
                io.to(gameId).emit('gameStateUpdate', updatedGame);
            }
        }, 3000);
    }
};

const executeCardChange = async (gameId: string) => {
    console.log('=== EXECUTE CARD CHANGE START ===');
    try {
        const game = await Game.findById(gameId);
        if (!game || !game.currentVote) {
            console.log('No game or vote found');
            return;
        }

        // Handle bot card selections first
        const botPlayers = game.players.filter(p => p.isBot);
        for (const bot of botPlayers) {
            if (!game.currentVote.cardsToChange.get(bot.id)) {
                const selectedCards = botSelectCardsToChange(game, bot.id);
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
                    if (availableCards.length === 0) break;
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
            if (!player) continue;

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
        game.phase = game.previousPhase || 'playing';  // Restore previous phase
        game.previousPhase = undefined;  // Clear previous phase

        console.log('Final game state:', {
            phase: game.phase,
            previousPhase: game.previousPhase,
            currentVote: game.currentVote
        });

        await game.save();
        io.to(gameId).emit('cardsChanged');
        io.to(gameId).emit('gameStateUpdate', game);

    } catch (error) {
        console.error('Error in executeCardChange:', error);
        // Emit error to clients
        io.to(gameId).emit('cardChangeError', {
            message: 'Failed to change cards'
        });
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
    updatePackUsageAndRating,
    rateCardPack,
    getSortedPacks,
    getMessagesSince,
    initiateVote,
    submitVote,
    selectCardsToChange,
    resolveVote,
    executeCardChange
};

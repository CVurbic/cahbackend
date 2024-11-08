import mongoose, { Schema, Document } from 'mongoose';
import { Card, BlackCard, WhiteCard } from '../types/game';

export interface IPlayer {
    id: string;
    name: string;
    hand: Card[];
    score: number;
    isBot: boolean;
}

export interface IChatMessage {
    sender: string;
    content: string;
    timestamp: Date;
    isSystemMessage: boolean;
    gameId: string;

}

export interface IGame extends Document {
    _id: string;
    gameName: string;
    creatorId: string;
    players: IPlayer[];
    activePlayers: string[];
    currentBlackCard: BlackCard | null;
    cardCzar: string | null;
    round: number;
    phase: 'lobby' | 'playing' | 'selection' | 'roundWinner' | 'gameOver';
    winner: string | null;
    blackCards: BlackCard[];
    whiteCards: WhiteCard[];
    dealtWhiteCards: string[];
    playedCards: Map<string, Card[]>;
    lastWinner: string | null;
    lastWinningCard: Card | null;
    winningScore: number;
    revealedCards: string[];
    selectedBlackCardPacks: string[];
    selectedWhiteCardPacks: string[];
    createdAt: Date;
    onlineUsers: string[];
    lastWinningReason: string | null;
    chatMessages: IChatMessage[];
}

const GameSchema: Schema = new Schema({
    _id: { type: String, required: true },
    gameName: { type: String, required: true },
    creatorId: { type: String, required: true },
    players: [{
        id: String,
        name: String,
        hand: [Schema.Types.Mixed],
        score: Number,
        isBot: Boolean
    }],
    activePlayers: [String],
    currentBlackCard: {
        type: Object,
        default: null
    },
    cardCzar: String,
    round: Number,
    phase: String,
    winner: String,
    blackCards: [Schema.Types.Mixed],
    whiteCards: [Schema.Types.Mixed],
    dealtWhiteCards: [String],
    playedCards: {
        type: Map,
        of: [Schema.Types.Mixed],
        default: () => new Map()
    },
    lastWinner: String,
    lastWinningCard: Schema.Types.Mixed,
    winningScore: { type: Number, required: true },
    revealedCards: [String],
    selectedBlackCardPacks: [String],
    selectedWhiteCardPacks: [String],
    createdAt: { type: Date, default: Date.now },
    onlineUsers: [String],
    lastWinningReason: { type: String },
    chatMessages: [{
        sender: String,
        content: String,
        timestamp: { type: Date, default: Date.now },
        isSystemMessage: Boolean
    }]
}, { _id: false });

const Game = mongoose.model<IGame>('Game', GameSchema);

export default Game;

import mongoose, { Schema, Document } from 'mongoose';
import { Card, BlackCard, WhiteCard } from '../types/game';
import { ICardPack } from './Card';

export interface IPlayer {
    id: string;
    name: string;
    hand: Card[];
    score: number;
    isBot: boolean;
}

export interface IChatMessage {
    _id: string;
    sender: string;
    content: string;
    timestamp: Date;
    isSystemMessage: boolean;
    gameId: string;
    status: string;
}

export interface Vote {
    id: string;
    initiator: string;
    cardCount: number;
    expiresAt: Date;
    timestamp: Date;
    votes: { [playerId: string]: boolean };
    status: 'active' | 'passed' | 'failed' | 'selecting' | 'completed';
    cardsToChange: { [playerId: string]: string[] };
    roundInitiated: number;
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
    phase: 'lobby' | 'playing' | 'selection' | 'roundWinner' | 'gameOver' | 'voting';
    winner: string | null;
    blackCards: BlackCard[];
    whiteCards: WhiteCard[];
    dealtWhiteCards: string[];
    playedCards: Map<string, Card[]>;
    lastWinner: string | null;
    lastWinningCard: Card | null;
    winningScore: number;
    revealedCards: string[];
    selectedBlackCardPacks: ICardPack[];
    selectedWhiteCardPacks: ICardPack[];
    selectedBlackCardPacksIDs: string[];
    selectedWhiteCardPacksIDs: string[];
    createdAt: Date;
    onlineUsers: string[];
    lastWinningReason: string | null;
    chatMessages: IChatMessage[];
    currentVote: Vote | null;
    usedVotes: string[];
    lastVoteRound: number;
    previousPhase?: 'playing' | 'selection' | 'roundWinner' | 'voting' | 'gameOver' | 'lobby';
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
    phase: {
        type: String,
        enum: ['lobby', 'playing', 'selection', 'roundWinner', 'gameOver', 'voting'],
        required: true
    },
    previousPhase: {
        type: String,
        enum: ['playing', 'selection', 'roundWinner', 'voting', 'gameOver', 'lobby']
    },
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
    selectedBlackCardPacks: [{ type: Schema.Types.Mixed }],
    selectedWhiteCardPacks: [{ type: Schema.Types.Mixed }],
    selectedBlackCardPacksIDs: [String],
    selectedWhiteCardPacksIDs: [String],
    createdAt: { type: Date, default: Date.now },
    onlineUsers: [String],
    lastWinningReason: { type: String },
    chatMessages: [{
        _id: { type: String, default: () => new mongoose.Types.ObjectId().toString() },
        sender: String,
        content: String,
        timestamp: { type: Date, default: Date.now },
        isSystemMessage: Boolean,
        gameId: String
    }],
    currentVote: {
        id: String,
        initiator: String,
        cardCount: Number,
        expiresAt: Date,
        timestamp: Date,
        votes: {
            type: Map,
            of: Boolean,
            default: new Map()
        },
        status: {
            type: String,
            enum: ['active', 'passed', 'failed', 'selecting', 'completed'],
            default: null
        },
        cardsToChange: {
            type: Map,
            of: [String],
            default: new Map()
        },
        roundInitiated: Number
    },
    usedVotes: {
        type: [String],
        default: []
    },
    lastVoteRound: {
        type: Number,
        default: 0
    }
}, { _id: false });

const Game = mongoose.model<IGame>('Game', GameSchema);

export default Game;

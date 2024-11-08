"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = __importStar(require("mongoose"));
const GameSchema = new mongoose_1.Schema({
    _id: { type: String, required: true },
    gameName: { type: String, required: true },
    creatorId: { type: String, required: true },
    players: [{
            id: String,
            name: String,
            hand: [mongoose_1.Schema.Types.Mixed],
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
    blackCards: [mongoose_1.Schema.Types.Mixed],
    whiteCards: [mongoose_1.Schema.Types.Mixed],
    dealtWhiteCards: [String],
    playedCards: {
        type: Map,
        of: [mongoose_1.Schema.Types.Mixed],
        default: () => new Map()
    },
    lastWinner: String,
    lastWinningCard: mongoose_1.Schema.Types.Mixed,
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
const Game = mongoose_1.default.model('Game', GameSchema);
exports.default = Game;

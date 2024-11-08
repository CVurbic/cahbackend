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
exports.Card = exports.CardPack = void 0;
const mongoose_1 = __importStar(require("mongoose"));
const cardSchema = new mongoose_1.default.Schema({
    text: { type: String, required: true },
    type: { type: String, enum: ['black', 'white'], required: true },
    pack: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'CardPack', required: true },
    blanks: { type: Number, default: 1 }, // For black cards
    createdBy: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'User' },
    createdAt: { type: Date, default: Date.now }
});
const CardPackSchema = new mongoose_1.Schema({
    name: { type: String, required: true },
    isPublic: { type: Boolean, default: true },
    isOriginal: { type: Boolean, default: false },
    createdBy: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User', required: true },
    createdAt: { type: Date, default: Date.now },
    blackCardCount: { type: Number, default: 0 },
    whiteCardCount: { type: Number, default: 0 },
    usageCount: { type: Number, default: 0 },
    rating: { type: Number, default: 0 }
});
exports.CardPack = mongoose_1.default.model('CardPack', CardPackSchema);
exports.Card = mongoose_1.default.model('Card', cardSchema);

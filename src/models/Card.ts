import mongoose, { Schema, Document } from 'mongoose';

const cardSchema = new mongoose.Schema({
    text: { type: String, required: true },
    type: { type: String, enum: ['black', 'white'], required: true },
    pack: { type: mongoose.Schema.Types.ObjectId, ref: 'CardPack', required: true },
    blanks: { type: Number, default: 1 }, // For black cards
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    createdAt: { type: Date, default: Date.now }
});

export interface ICardPack extends Document {
    name: string;
    isPublic: boolean;
    isOriginal: boolean;
    createdBy: mongoose.Types.ObjectId;
    createdAt: Date;
    blackCardCount: number;
    whiteCardCount: number;
    usageCount: number;
    rating: number;
    imageUrl?: string;
    totalRatings: number;
    blackCardRating: number;
    whiteCardRating: number;
    blackCardUsage: number;
    whiteCardUsage: number;
}

const CardPackSchema: Schema = new Schema({
    name: { type: String, required: true },
    isPublic: { type: Boolean, default: true },
    isOriginal: { type: Boolean, default: false },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    createdAt: { type: Date, default: Date.now, index: true },
    blackCardCount: { type: Number, default: 0 },
    whiteCardCount: { type: Number, default: 0 },
    usageCount: { type: Number, default: 0, index: true },
    rating: { type: Number, default: 0, index: true },
    totalRatings: { type: Number, default: 0 },
    imageUrl: { type: String },
    blackCardRating: { type: Number, default: 0 },
    whiteCardRating: { type: Number, default: 0 },
    blackCardUsage: { type: Number, default: 0 },
    whiteCardUsage: { type: Number, default: 0 }
});

CardPackSchema.index({ rating: -1, usageCount: -1 });
CardPackSchema.index({ createdAt: -1, rating: -1 });

export const CardPack = mongoose.model<ICardPack>('CardPack', CardPackSchema);

export const Card = mongoose.model('Card', cardSchema);

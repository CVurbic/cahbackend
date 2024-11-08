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
Object.defineProperty(exports, "__esModule", { value: true });
exports.getCardsFromPacks = getCardsFromPacks;
exports.fetchAvailablePackNames = fetchAvailablePackNames;
const Card_1 = require("../models/Card");
const mongoose_1 = require("mongoose");
function getCardsFromPacks(packIds, cardType) {
    return __awaiter(this, void 0, void 0, function* () {
        console.log(`Fetching ${cardType} cards from packs:`, packIds);
        // Add this log to check all packs in the database
        const allPacks = yield Card_1.CardPack.find();
        console.log('All packs in database:', allPacks.map(pack => ({ id: pack._id, name: pack.name })));
        const objectIds = packIds.map(id => new mongoose_1.Types.ObjectId(id));
        const packs = yield Card_1.CardPack.find({ _id: { $in: objectIds } });
        console.log(`Found ${packs.length} packs:`, packs.map(pack => pack.name));
        console.log('Pack IDs:', packs.map(pack => pack._id));
        const cards = yield Card_1.Card.find({ pack: { $in: objectIds }, type: cardType });
        console.log(`Found ${cards.length} ${cardType} cards`);
        const formattedCards = cards.map(card => ({
            id: card._id.toString(),
            text: card.text,
            type: card.type,
            pack: card.pack.toString(),
            blanks: cardType === 'black' ? (card.blanks || 1) : undefined
        }));
        console.log(`Formatted ${formattedCards.length} ${cardType} cards`);
        console.log('Sample card:', formattedCards[0]);
        return formattedCards;
    });
}
function fetchAvailablePackNames() {
    return __awaiter(this, void 0, void 0, function* () {
        const packs = yield Card_1.CardPack.find().select('name');
        console.log(`Fetched ${packs.length} available packs:`, packs.map(pack => pack.name));
        return packs.map(pack => pack.name);
    });
}

import { BlackCard, WhiteCard } from '../types/game';
import { Card, CardPack } from '../models/Card';
import { Types } from 'mongoose';

export async function getCardsFromPacks(packIds: string[], cardType: 'black' | 'white'): Promise<BlackCard[] | WhiteCard[]> {
    console.log(`Fetching ${cardType} cards from packs:`, packIds);

    // Add this log to check all packs in the database
    const allPacks = await CardPack.find();
    console.log('All packs in database:', allPacks.map(pack => ({ id: pack._id, name: pack.name })));

    const objectIds = packIds.map(id => new Types.ObjectId(id));
    const packs = await CardPack.find({ _id: { $in: objectIds } });
    console.log(`Found ${packs.length} packs:`, packs.map(pack => pack.name));

    console.log('Pack IDs:', packs.map(pack => pack._id));

    const cards = await Card.find({ pack: { $in: objectIds }, type: cardType });
    console.log(`Found ${cards.length} ${cardType} cards`);

    const formattedCards = cards.map(card => ({
        id: card._id.toString(),
        text: card.text,
        type: card.type as 'black' | 'white',
        pack: card.pack.toString(),
        blanks: cardType === 'black' ? (card.blanks || 1) : undefined
    })) as BlackCard[] | WhiteCard[];

    console.log(`Formatted ${formattedCards.length} ${cardType} cards`);
    console.log('Sample card:', formattedCards[0]);

    return formattedCards;
}

export async function fetchAvailablePackNames(): Promise<string[]> {
    const packs = await CardPack.find().select('name');
    console.log(`Fetched ${packs.length} available packs:`, packs.map(pack => pack.name));
    return packs.map(pack => pack.name);
}

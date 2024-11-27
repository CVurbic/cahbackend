import { IGame } from '../models/Game';
import { WhiteCard } from '../types/game';
import { v4 as uuidv4 } from 'uuid';

export interface Bot {
    id: string;
    name: string;
}

export function createBot(name: string): Bot {
    const bot = {
        id: uuidv4(),
        name: name,
    };
    console.log(`Bot created: ${bot.name} (${bot.id})`);
    return bot;
}

export function botPlayCard(game: IGame, botId: string): WhiteCard[] | null {
    const bot = game.players.find(player => player.id === botId);
    if (!bot || bot.id === game.cardCzar) {
        console.log(`Bot ${botId} cannot play a card (is Card Czar or not found)`);
        return null;
    }

    console.log(`Bot ${bot.name} (${botId}) is playing a card`);
    console.log(`Current black card:`, game.currentBlackCard);

    const cardsNeeded = game.currentBlackCard?.blanks || 1;
    const playedCards: WhiteCard[] = [];

    console.log(`Bot ${bot.name} (${botId}) needs to play ${cardsNeeded} card(s)`);
    console.log(`Bot ${bot.name} (${botId}) current hand:`, bot.hand);

    for (let i = 0; i < cardsNeeded; i++) {
        if (bot.hand.length > 0) {
            const randomIndex = Math.floor(Math.random() * bot.hand.length);
            const card = bot.hand.splice(randomIndex, 1)[0] as WhiteCard;
            playedCards.push(card);
            console.log(`Bot ${bot.name} (${botId}) played card:`, card.text);
        } else {
            console.log(`Bot ${bot.name} (${botId}) has no cards left to play`);
        }
    }

    console.log(`Bot ${bot.name} (${botId}) played cards:`, playedCards.map(card => card.text));
    return playedCards;
}

export function botSelectWinner(game: IGame): string | null {
    if (game.phase !== 'selection') {
        console.log(`Bot cannot select winner: game phase is ${game.phase}`);
        return null;
    }

    const playerIds = Array.from(game.playedCards.keys());
    if (playerIds.length === 0) {
        console.log('Bot cannot select winner: no cards played');
        return null;
    }

    const randomIndex = Math.floor(Math.random() * playerIds.length);
    const winningPlayerId = playerIds[randomIndex];
    console.log(`Bot Card Czar selected winner: ${winningPlayerId}`);
    return winningPlayerId;
}

export function botHandleVote(game: IGame, botId: string): boolean {
    const shouldAgree = Math.random() < 0.7;
    console.log(`Bot ${botId} voted ${shouldAgree ? 'YES' : 'NO'} on the vote`);
    return shouldAgree;
}

export function botSelectCardsToChange(game: IGame, botId: string): string[] {
    const bot = game.players.find(player => player.id === botId);
    if (!bot || !game.currentVote) return [];

    const cardsToChange: string[] = [];
    const cardCount = game.currentVote.cardCount;

    while (cardsToChange.length < cardCount && bot.hand.length > cardsToChange.length) {
        const availableCards = bot.hand.filter(card => !cardsToChange.includes(card.id));
        const randomCard = availableCards[Math.floor(Math.random() * availableCards.length)];
        cardsToChange.push(randomCard.id);
    }

    console.log(`Bot ${bot.name} selected ${cardsToChange.length} cards to change`);
    return cardsToChange;
}

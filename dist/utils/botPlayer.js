"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createBot = createBot;
exports.botPlayCard = botPlayCard;
exports.botSelectWinner = botSelectWinner;
exports.botHandleVote = botHandleVote;
exports.botSelectCardsToChange = botSelectCardsToChange;
const uuid_1 = require("uuid");
function createBot(name) {
    const bot = {
        id: (0, uuid_1.v4)(),
        name: name,
    };
    console.log(`Bot created: ${bot.name} (${bot.id})`);
    return bot;
}
function botPlayCard(game, botId) {
    var _a;
    const bot = game.players.find(player => player.id === botId);
    if (!bot || bot.id === game.cardCzar) {
        console.log(`Bot ${botId} cannot play a card (is Card Czar or not found)`);
        return null;
    }
    console.log(`Bot ${bot.name} (${botId}) is playing a card`);
    console.log(`Current black card:`, game.currentBlackCard);
    const cardsNeeded = ((_a = game.currentBlackCard) === null || _a === void 0 ? void 0 : _a.blanks) || 1;
    const playedCards = [];
    console.log(`Bot ${bot.name} (${botId}) needs to play ${cardsNeeded} card(s)`);
    console.log(`Bot ${bot.name} (${botId}) current hand:`, bot.hand);
    for (let i = 0; i < cardsNeeded; i++) {
        if (bot.hand.length > 0) {
            const randomIndex = Math.floor(Math.random() * bot.hand.length);
            const card = bot.hand.splice(randomIndex, 1)[0];
            playedCards.push(card);
            console.log(`Bot ${bot.name} (${botId}) played card:`, card.text);
        }
        else {
            console.log(`Bot ${bot.name} (${botId}) has no cards left to play`);
        }
    }
    console.log(`Bot ${bot.name} (${botId}) played cards:`, playedCards.map(card => card.text));
    return playedCards;
}
function botSelectWinner(game) {
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
function botHandleVote(game, botId) {
    const shouldAgree = true;
    console.log(`Bot ${botId} voted ${shouldAgree ? 'YES' : 'NO'} on the vote`);
    return shouldAgree;
}
function botSelectCardsToChange(game, botId) {
    const bot = game.players.find(player => player.id === botId);
    if (!bot || !game.currentVote)
        return [];
    const cardsToChange = [];
    const cardCount = game.currentVote.cardCount;
    while (cardsToChange.length < cardCount && bot.hand.length > cardsToChange.length) {
        const availableCards = bot.hand.filter(card => !cardsToChange.includes(card.id));
        const randomCard = availableCards[Math.floor(Math.random() * availableCards.length)];
        cardsToChange.push(randomCard.id);
    }
    console.log(`Bot ${bot.name} selected ${cardsToChange.length} cards to change`);
    return cardsToChange;
}

import { ICardPack } from "../models/Card";

export interface Card {
    id: string;
    text: string;
    type: 'black' | 'white';
    pack: string;

}

export interface BlackCard extends Card {
    blanks: number;
}

export interface WhiteCard extends Card {
    type: 'white';
}

export interface Player {
    id: string;
    name: string;
    hand: Card[];
    score: number;
}

export interface GameState {
    _id: string;
    gameName: string;
    creatorId: string;
    players: Player[];
    currentBlackCard: BlackCard | null;
    cardCzar: string | null;
    winningScore: number;
    round: number;
    playedCards: { [key: string]: Card[] };
    phase: 'lobby' | 'playing' | 'selection' | 'roundWinner' | 'gameOver' | 'voting';
    winner: string | null;
    blackCards: Card[];
    whiteCards: Card[];
    dealtWhiteCards: string[];
    lastWinner: string | null;
    lastWinningCard: Card | null;
    revealedCards: string[];
    onlineUsers: string[];
    chatMessages: ChatMessage[];
    selectedBlackCardPacksIDs: string[];
    selectedWhiteCardPacksIDs: string[];
    selectedBlackCardPacks: ICardPack[];
    selectedWhiteCardPacks: ICardPack[];
    currentVote: Vote | null;
    usedVotes: Vote[];
    previousPhase: string | null;
}

export interface ChatMessage {
    _id: string;
    sender: string;
    content: string;
    timestamp: Date;
    gameId: string;
    status: string;
    isSystemMessage: boolean;
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

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
    phase: 'lobby' | 'playing' | 'selection' | 'roundWinner' | 'gameOver';
    winner: string | null;
    blackCards: Card[];
    whiteCards: Card[];
    dealtWhiteCards: string[];
    lastWinner: string | null;
    lastWinningCard: Card | null;
    revealedCards: string[];
    onlineUsers: string[];
    chatMessages: ChatMessage[];
}

export interface ChatMessage {
    sender: string;
    content: string;
    timestamp: Date;
    gameId: string;
    isSystemMessage: boolean;
}

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
exports.shuffleArray = shuffleArray;
exports.exponentialBackoff = exponentialBackoff;
function shuffleArray(array) {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
}
function exponentialBackoff(fn, maxRetries, baseDelay) {
    return __awaiter(this, void 0, void 0, function* () {
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                return yield fn(attempt);
            }
            catch (error) {
                if (attempt === maxRetries) {
                    throw error;
                }
                const delay = baseDelay * Math.pow(2, attempt - 1);
                console.log(`Retry attempt ${attempt} failed. Retrying in ${delay}ms...`);
                yield new Promise(resolve => setTimeout(resolve, delay));
            }
        }
        throw new Error('Should not reach here');
    });
}

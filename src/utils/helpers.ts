export function shuffleArray<T>(array: T[]): T[] {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
}

export async function exponentialBackoff<T>(
    fn: (attempt: number) => Promise<T>,
    maxRetries: number,
    baseDelay: number
): Promise<T> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            return await fn(attempt);
        } catch (error) {
            if (attempt === maxRetries) {
                throw error;
            }
            const delay = baseDelay * Math.pow(2, attempt - 1);
            console.log(`Retry attempt ${attempt} failed. Retrying in ${delay}ms...`);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
    throw new Error('Should not reach here');
}

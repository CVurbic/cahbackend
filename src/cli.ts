import { Command } from 'commander';
import axios from 'axios';

const program = new Command();

const makeRequest = async (url: string) => {
    try {
        console.log(`Attempting to connect to ${url}...`);
        const response = await axios.get(url);
        console.log('Server response:', response.data);
    } catch (error: any) {
        console.error(`Failed to fetch from ${url}:`, error.message);
        if (error.response) {
            console.error('Response data:', error.response.data);
            console.error('Response status:', error.response.status);
            console.error('Response headers:', error.response.headers);
        } else if (error.request) {
            console.error('No response received');
        }
    }
};

program
    .command('players')
    .description('Show current players in all games')
    .action(() => makeRequest('http://0.0.0.0:3001/api/game/current-players'));

program
    .command('test')
    .description('Test server connection')
    .action(() => makeRequest('http://0.0.0.0:3001/test'));

program.parse(process.argv);

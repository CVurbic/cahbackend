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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const commander_1 = require("commander");
const axios_1 = __importDefault(require("axios"));
const program = new commander_1.Command();
const makeRequest = (url) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        console.log(`Attempting to connect to ${url}...`);
        const response = yield axios_1.default.get(url);
        console.log('Server response:', response.data);
    }
    catch (error) {
        console.error(`Failed to fetch from ${url}:`, error.message);
        if (error.response) {
            console.error('Response data:', error.response.data);
            console.error('Response status:', error.response.status);
            console.error('Response headers:', error.response.headers);
        }
        else if (error.request) {
            console.error('No response received');
        }
    }
});
program
    .command('players')
    .description('Show current players in all games')
    .action(() => makeRequest('http://0.0.0.0:3001/api/game/current-players'));
program
    .command('test')
    .description('Test server connection')
    .action(() => makeRequest('http://0.0.0.0:3001/test'));
program.parse(process.argv);

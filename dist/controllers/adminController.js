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
exports.getStats = exports.deleteDocument = exports.updateDocument = exports.getDocuments = exports.getCollections = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
// Add this list of valid collections
const VALID_COLLECTIONS = [
    'admins',
    'games',
    'users',
    'cards',
    'cardpacks',
    'notifications',
    'messages'
];
const getCollections = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        console.log('Fetching collections...');
        // Return the list of valid collections instead of querying MongoDB
        res.json(VALID_COLLECTIONS);
    }
    catch (error) {
        console.error('Error fetching collections:', error);
        res.status(500).json({ message: 'Error fetching collections' });
    }
});
exports.getCollections = getCollections;
const getDocuments = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { collection } = req.params;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;
        // Validate collection name
        if (!VALID_COLLECTIONS.includes(collection)) {
            return res.status(400).json({ message: 'Invalid collection' });
        }
        // Get the MongoDB collection
        const db = mongoose_1.default.connection.db;
        const mongoCollection = db === null || db === void 0 ? void 0 : db.collection(collection);
        // Get total count of documents
        const total = yield (mongoCollection === null || mongoCollection === void 0 ? void 0 : mongoCollection.countDocuments());
        // Get paginated documents
        const docs = yield (mongoCollection === null || mongoCollection === void 0 ? void 0 : mongoCollection.find({}).skip(skip).limit(limit).toArray());
        // Calculate total pages
        const pages = Math.ceil((total !== null && total !== void 0 ? total : 0) / limit);
        res.json({
            docs,
            total,
            pages,
            currentPage: page
        });
    }
    catch (error) {
        console.error('Error fetching documents:', error);
        res.status(500).json({ message: 'Error fetching documents' });
    }
});
exports.getDocuments = getDocuments;
const updateDocument = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const { collection, id } = req.params;
        const updateData = req.body;
        // Validate collection name
        if (!VALID_COLLECTIONS.includes(collection)) {
            return res.status(400).json({ message: 'Invalid collection' });
        }
        const db = mongoose_1.default.connection.db;
        const mongoCollection = db === null || db === void 0 ? void 0 : db.collection(collection);
        const result = yield (mongoCollection === null || mongoCollection === void 0 ? void 0 : mongoCollection.updateOne({ _id: new mongoose_1.default.Types.ObjectId(id) }, { $set: updateData }));
        if (((_a = result === null || result === void 0 ? void 0 : result.matchedCount) !== null && _a !== void 0 ? _a : 0) === 0) {
            return res.status(404).json({ message: 'Document not found' });
        }
        res.json({ message: 'Document updated successfully' });
    }
    catch (error) {
        console.error('Error updating document:', error);
        res.status(500).json({ message: 'Error updating document' });
    }
});
exports.updateDocument = updateDocument;
const deleteDocument = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const { collection, id } = req.params;
        console.log('Deleting document:', collection, id);
        // Validate collection name
        if (!VALID_COLLECTIONS.includes(collection)) {
            return res.status(400).json({ message: 'Invalid collection' });
        }
        const db = mongoose_1.default.connection.db;
        const mongoCollection = db === null || db === void 0 ? void 0 : db.collection(collection);
        // Cast the query to any to bypass TypeScript's type checking
        const query = { _id: id };
        const result = yield (mongoCollection === null || mongoCollection === void 0 ? void 0 : mongoCollection.deleteOne(query));
        if (((_a = result === null || result === void 0 ? void 0 : result.deletedCount) !== null && _a !== void 0 ? _a : 0) === 0) {
            return res.status(404).json({ message: 'Document not found' });
        }
        res.json({ message: 'Document deleted successfully' });
    }
    catch (error) {
        console.error('Error deleting document:', error);
        res.status(500).json({ message: 'Error deleting document' });
    }
});
exports.deleteDocument = deleteDocument;
const getStats = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const db = mongoose_1.default.connection.db;
        const stats = {
            games: yield (db === null || db === void 0 ? void 0 : db.collection('games').countDocuments()),
            cards: yield (db === null || db === void 0 ? void 0 : db.collection('cards').countDocuments()),
            cardPacks: yield (db === null || db === void 0 ? void 0 : db.collection('cardpacks').countDocuments()),
            users: yield (db === null || db === void 0 ? void 0 : db.collection('users').countDocuments()),
        };
        res.json(stats);
    }
    catch (error) {
        console.error('Error fetching stats:', error);
        res.status(500).json({ message: 'Error fetching stats' });
    }
});
exports.getStats = getStats;

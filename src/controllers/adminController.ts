import { Request, Response } from 'express';
import mongoose from 'mongoose';

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

export const getCollections = async (req: Request, res: Response) => {
    try {
        console.log('Fetching collections...');
        // Return the list of valid collections instead of querying MongoDB
        res.json(VALID_COLLECTIONS);
    } catch (error) {
        console.error('Error fetching collections:', error);
        res.status(500).json({ message: 'Error fetching collections' });
    }
};

export const getDocuments = async (req: Request, res: Response) => {
    try {
        const { collection } = req.params;
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 10;
        const skip = (page - 1) * limit;

        // Validate collection name
        if (!VALID_COLLECTIONS.includes(collection)) {
            return res.status(400).json({ message: 'Invalid collection' });
        }

        // Get the MongoDB collection
        const db = mongoose.connection.db;
        const mongoCollection = db?.collection(collection);

        // Get total count of documents
        const total = await mongoCollection?.countDocuments();

        // Get paginated documents
        const docs = await mongoCollection
            ?.find({})
            .skip(skip)
            .limit(limit)
            .toArray();

        // Calculate total pages
        const pages = Math.ceil((total ?? 0) / limit);

        res.json({
            docs,
            total,
            pages,
            currentPage: page
        });
    } catch (error) {
        console.error('Error fetching documents:', error);
        res.status(500).json({ message: 'Error fetching documents' });
    }
};

export const updateDocument = async (req: Request, res: Response) => {
    try {
        const { collection, id } = req.params;
        const updateData = req.body;

        // Validate collection name
        if (!VALID_COLLECTIONS.includes(collection)) {
            return res.status(400).json({ message: 'Invalid collection' });
        }

        const db = mongoose.connection.db;
        const mongoCollection = db?.collection(collection);

        const result = await mongoCollection?.updateOne(
            { _id: new mongoose.Types.ObjectId(id) },
            { $set: updateData }
        );

        if ((result?.matchedCount ?? 0) === 0) {
            return res.status(404).json({ message: 'Document not found' });
        }

        res.json({ message: 'Document updated successfully' });
    } catch (error) {
        console.error('Error updating document:', error);
        res.status(500).json({ message: 'Error updating document' });
    }
};

export const deleteDocument = async (req: Request, res: Response) => {
    try {
        const { collection, id } = req.params;

        console.log('Deleting document:', collection, id);

        // Validate collection name
        if (!VALID_COLLECTIONS.includes(collection)) {
            return res.status(400).json({ message: 'Invalid collection' });
        }

        const db = mongoose.connection.db;
        const mongoCollection = db?.collection(collection);

        // Cast the query to any to bypass TypeScript's type checking
        const query = { _id: id } as any;
        const result = await mongoCollection?.deleteOne(query);

        if ((result?.deletedCount ?? 0) === 0) {
            return res.status(404).json({ message: 'Document not found' });
        }

        res.json({ message: 'Document deleted successfully' });
    } catch (error) {
        console.error('Error deleting document:', error);
        res.status(500).json({ message: 'Error deleting document' });
    }
};

export const getStats = async (req: Request, res: Response) => {
    try {
        const db = mongoose.connection.db;
        
        const stats = {
            games: await db?.collection('games').countDocuments(),
            cards: await db?.collection('cards').countDocuments(),
            cardPacks: await db?.collection('cardpacks').countDocuments(),
            users: await db?.collection('users').countDocuments(),
        };

        res.json(stats);
    } catch (error) {
        console.error('Error fetching stats:', error);
        res.status(500).json({ message: 'Error fetching stats' });
    }
}; 
// packages/plugin-nutrifi/src/db/index.ts

import { MongoClient } from 'mongodb';
import { 
    elizaLogger,
    type UUID
} from "@elizaos/core";

export interface MenuItem {
    id: string;
    name: string;
    description?: string;
    price: number;
    nutritionInfo?: {
        calories: number;
        protein?: number;
        carbs?: number;
        fats?: number;
        allergens?: string[];
    };
    dietaryTags?: string[];
}

export interface RestaurantData {
    id: UUID;
    uberId: string;
    name: string;
    location: {
        type: "Point";
        coordinates: [number, number];
        address: string;
    };
    menu: MenuItem[];
    nutritionInfo: {
        hasHealthyOptions: boolean;
        averageCaloriesPerMeal: number;
        dietaryOptions: string[];
    };
    lastUpdated: Date;
    cacheExpiry: Date;
}

export const COLLECTIONS = {
    USER_PREFERENCES: 'user_preferences',
    MEAL_HISTORY: 'meal_history',
    RESTAURANT_DATA: 'restaurant_data'
} as const;

interface DatabaseConfig {
    uri: string;
    dbName: string;
    options?: {
        maxPoolSize?: number;
        minPoolSize?: number;
        maxIdleTimeMS?: number;
    };
}

export class NutriFiDatabase {
    private static client: MongoClient;
    private static dbName: string;

    static async initialize(config: DatabaseConfig): Promise<void> {
        if (this.client) {
            return;
        }

        try {
            elizaLogger.debug('[DB] Initializing MongoDB connection');
            
            this.client = new MongoClient(config.uri, {
                maxPoolSize: config.options?.maxPoolSize || 100,
                minPoolSize: config.options?.minPoolSize || 5,
                maxIdleTimeMS: config.options?.maxIdleTimeMS || 60000,
                connectTimeoutMS: 10000,
                serverSelectionTimeoutMS: 5000,
                socketTimeoutMS: 45000,
            });

            await this.client.connect();
            this.dbName = config.dbName;

            // Initialize collections
            await this.initializeCollections();
            
            elizaLogger.success('[DB] MongoDB connection established');
        } catch (error) {
            elizaLogger.error('[DB] Failed to initialize MongoDB:', error);
            throw error;
        }
    }

    // Add these methods to your NutriFiDatabase class in packages/plugin-nutrifi/src/db/index.ts

    static async getRestaurantsByLocation(lat: number, lng: number, radiusInMeters: number = 5000): Promise<RestaurantData[]> {
        const db = this.getDb();
        const results = await db.collection(COLLECTIONS.RESTAURANT_DATA)
            .find({
                location: {
                    $near: {
                        $geometry: {
                            type: "Point",
                            coordinates: [lng, lat]
                        },
                        $maxDistance: radiusInMeters
                    }
                },
                cacheExpiry: { $gt: new Date() }
            })
            .toArray();
        
        return results as unknown as RestaurantData[];
    }

static async cacheRestaurant(restaurantData: RestaurantData) {
    const db = this.getDb();
    await db.collection(COLLECTIONS.RESTAURANT_DATA).updateOne(
        { uberId: restaurantData.uberId },
        { 
            $set: {
                ...restaurantData,
                lastUpdated: new Date()
            }
        },
        { upsert: true }
    );
}

static async getRestaurantByUberId(uberId: string) {
    const db = this.getDb();
    return await db.collection(COLLECTIONS.RESTAURANT_DATA)
        .findOne({ 
            uberId,
            cacheExpiry: { $gt: new Date() }
        });
}

static async clearExpiredCache() {
    const db = this.getDb();
    await db.collection(COLLECTIONS.RESTAURANT_DATA)
        .deleteMany({
            cacheExpiry: { $lte: new Date() }
        });
}

    private static async initializeCollections(): Promise<void> {
        const db = this.client.db(this.dbName);
        const collections = Object.values(COLLECTIONS);
        
        for (const collectionName of collections) {
            try {
                await db.createCollection(collectionName);
                elizaLogger.debug(`[DB] Created collection: ${collectionName}`);
            } catch (error: any) {
                // Ignore error if collection already exists (error code 48)
                if (error.code !== 48) {
                    elizaLogger.error(`[DB] Error creating collection ${collectionName}:`, error);
                }
            }
        }

        // Create indexes for better performance
        await this.createIndexes();
    }

    private static async createIndexes(): Promise<void> {
        const db = this.client.db(this.dbName);

        try {
            // User Preferences indexes
            await db.collection(COLLECTIONS.USER_PREFERENCES).createIndex(
                { userId: 1 }, 
                { unique: true }
            );

            // Meal History indexes
            await db.collection(COLLECTIONS.MEAL_HISTORY).createIndex(
                { userId: 1, timestamp: -1 }
            );

            // Restaurant Data indexes
            await db.collection(COLLECTIONS.RESTAURANT_DATA).createIndex(
                { location: "2dsphere" }
            );

            elizaLogger.debug('[DB] Indexes created successfully');
        } catch (error) {
            elizaLogger.error('[DB] Error creating indexes:', error);
            throw error;
        }
    }

    static getDb() {
        if (!this.client) {
            throw new Error('Database not initialized. Call initialize() first.');
        }
        return this.client.db(this.dbName);
    }

    static async disconnect(): Promise<void> {
        if (this.client) {
            await this.client.close();
            this.client = undefined;
            elizaLogger.debug('[DB] MongoDB connection closed');
        }
    }

    // Utility functions for common operations
    static async getUserPreferences(userId: UUID) {
        const db = this.getDb();
        return await db.collection(COLLECTIONS.USER_PREFERENCES).findOne({ userId });
    }

    static async updateUserPreferences(userId: UUID, preferences: any) {
        const db = this.getDb();
        await db.collection(COLLECTIONS.USER_PREFERENCES).updateOne(
            { userId },
            { $set: preferences },
            { upsert: true }
        );
    }

    static async addMealHistory(userId: UUID, mealData: any) {
        const db = this.getDb();
        await db.collection(COLLECTIONS.MEAL_HISTORY).insertOne({
            userId,
            ...mealData,
            timestamp: new Date()
        });
    }

    static async getMealHistory(userId: UUID, limit = 10) {
        const db = this.getDb();
        return await db.collection(COLLECTIONS.MEAL_HISTORY)
            .find({ userId })
            .sort({ timestamp: -1 })
            .limit(limit)
            .toArray();
    }
}
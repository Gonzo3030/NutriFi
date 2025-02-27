// packages/plugin-nutrifi/src/services/uber-eats.ts

import axios from 'axios';
import { elizaLogger } from "@elizaos/core";
import { NutriFiDatabase } from '../db';
import { RestaurantData, MenuItem } from '../types/restaurant';

// Service-specific interfaces
interface UberEatsConfig {
    clientId: string;
    clientSecret: string;
    sandbox?: boolean;
    cacheTTL?: number;
    baseUrl?: string;
}

interface Location {
    lat: number;
    lng: number;
}

interface UserPreferences {
    dietaryPreferences?: {
        type?: string;
        restrictions?: string[];
        allergies?: string[];
    };
    fitnessGoals?: {
        primary?: string;
        calorieTarget?: number;
        macroTargets?: {
            protein?: number;
            carbs?: number;
            fats?: number;
        };
    };
}

export class UberEatsService {
    private token: string | null = null;
    private readonly config: UberEatsConfig;
    private readonly baseUrl: string;

    constructor(config: UberEatsConfig) {
        this.config = config;
        this.baseUrl = config.baseUrl || (config.sandbox
            ? 'https://api.uber.com/v1/sandbox'
            : 'https://api.uber.com/v1');
    }

    private async getAuthToken(): Promise<string> {
        if (this.token) return this.token;
        
        try {
            const response = await axios.post('https://login.uber.com/oauth/v2/token', {
                client_id: this.config.clientId,
                client_secret: this.config.clientSecret,
                grant_type: 'client_credentials',
                scope: 'eats.store eats.order'
            });

            this.token = response.data.access_token;
            return this.token;
        } catch (error) {
            elizaLogger.error('[UberEats] Authentication error:', error);
            throw new Error('Failed to authenticate with UberEats API');
        }
    }

    async searchRestaurants(location: Location, preferences: UserPreferences): Promise<RestaurantData[]> {
        try {
            // Get cached results from MongoDB
            const cachedResults = await NutriFiDatabase.getRestaurantsByLocation(
                location.lat,
                location.lng
            );

            if (cachedResults.length > 0) {
                elizaLogger.debug(`[UberEats] Found ${cachedResults.length} cached restaurants`);
                return this.filterByPreferences(cachedResults, preferences);
            }

            // If not in cache, call UberEats API
            const token = await this.getAuthToken();
            const response = await axios.get(`${this.baseUrl}/eats/stores/nearby`, {
                headers: { Authorization: `Bearer ${token}` },
                params: {
                    latitude: location.lat,
                    longitude: location.lng
                }
            });

            // Process and cache results
            const restaurants = await this.processApiResponse(response.data);
            return this.filterByPreferences(restaurants, preferences);
        } catch (error) {
            elizaLogger.error('[UberEats] Error searching restaurants:', error);
            throw error;
        }
    }

    private async processApiResponse(apiData: any): Promise<RestaurantData[]> {
        const restaurants: RestaurantData[] = [];

        for (const store of apiData.stores) {
            const restaurant: RestaurantData = {
                id: crypto.randomUUID(),
                uberId: store.id,
                name: store.name,
                location: {
                    type: "Point",
                    coordinates: [store.longitude, store.latitude],
                    address: store.address
                },
                menu: await this.fetchMenuItems(store.id),
                nutritionInfo: {
                    hasHealthyOptions: true, // This should be determined based on menu analysis
                    averageCaloriesPerMeal: 0, // This should be calculated from menu items
                    dietaryOptions: [] // This should be populated based on menu analysis
                },
                lastUpdated: new Date(),
                cacheExpiry: new Date(Date.now() + (this.config.cacheTTL || 3600) * 1000)
            };

            await NutriFiDatabase.cacheRestaurant(restaurant);
            restaurants.push(restaurant);
        }

        return restaurants;
    }

    private async fetchMenuItems(restaurantId: string): Promise<MenuItem[]> {
        // Implement menu fetching logic here
        // This will need to make another API call to UberEats
        return [];
    }

    private filterByPreferences(restaurants: RestaurantData[], preferences: UserPreferences): RestaurantData[] {
        return restaurants.filter(restaurant => {
            // Check dietary preferences
            if (preferences.dietaryPreferences?.type) {
                if (!restaurant.nutritionInfo.dietaryOptions.includes(preferences.dietaryPreferences.type)) {
                    return false;
                }
            }

            // Check allergies (implementation will depend on how allergy info is stored)
            if (preferences.dietaryPreferences?.allergies?.length > 0) {
                // Implement allergy filtering
            }

            // Check calorie targets
            if (preferences.fitnessGoals?.calorieTarget) {
                if (restaurant.nutritionInfo.averageCaloriesPerMeal > preferences.fitnessGoals.calorieTarget) {
                    return false;
                }
            }

            return true;
        });
    }
}
// packages/plugin-nutrifi/src/types/restaurant.ts
import { UUID } from "@elizaos/core";

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
  dietaryTags?: string[];  // ['vegan', 'gluten-free', etc]
}

export interface RestaurantData {
  id: UUID;
  uberId: string;
  name: string;
  location: {
    type: "Point";
    coordinates: [number, number];  // [longitude, latitude]
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
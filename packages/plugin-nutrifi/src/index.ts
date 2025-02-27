import type { Plugin } from "@elizaos/core";
import { elizaLogger } from "@elizaos/core";
import { recommendMealAction } from "./actions/recommend-meal";
import { nutritionGoalsEvaluator } from "./evaluators/nutritionGoalsEvaluator";
import { initializeMongoDB } from "./db/configuration";
import { UberEatsService } from './services/uber-eats';

// Initial banner
console.log("\n┌════════════════════════════════════════┐");
console.log("│          NUTRIFI PLUGIN                │");
console.log("├────────────────────────────────────────┤");
console.log("│  Initializing NutriFi Plugin...        │");
console.log("│  Version: 0.1.0                        │");
console.log("└════════════════════════════════════════┘");

// Initialize services
const initializeServices = () => {
    const uberEatsConfig = {
        clientId: process.env.UBER_EATS_CLIENT_ID,
        clientSecret: process.env.UBER_EATS_CLIENT_SECRET,
        sandbox: process.env.NODE_ENV !== 'production'
    };

    if (!uberEatsConfig.clientId || !uberEatsConfig.clientSecret) {
        elizaLogger.warn("⚠️ UberEats credentials not set - Delivery features will be limited");
        return null;
    }

    return new UberEatsService(uberEatsConfig);
};

// Initialize MongoDB before actions
const initializeDatabase = async () => {
    if (process.env.MONGODB_CONNECTION_STRING) {
        try {
            await initializeMongoDB();
            elizaLogger.success('[NutriFi] MongoDB initialized successfully');
            return true;
        } catch (error) {
            elizaLogger.error('[NutriFi] Failed to initialize MongoDB:', error);
            return false;
        }
    }
    return false;
};

const initializeActions = async () => {
    try {
        // Initialize MongoDB first
        await initializeDatabase();

        const nutrifiEnabled = process.env.NUTRIFI_ENABLED;
        const uberEatsService = initializeServices();

        if (!nutrifiEnabled) {
            elizaLogger.warn("⚠️ NUTRIFI_ENABLED not set - NutriFi actions will not be available");
            return [];
        }

        // Create the actions array
        const actions = [recommendMealAction];

        // Store the UberEats service instance globally for actions to access
        global.uberEatsService = uberEatsService;

        elizaLogger.success("✔ NutriFi actions initialized successfully.");
        return actions;
    } catch (error) {
        elizaLogger.error("❌ Failed to initialize NutriFi actions:", error);
        return []; // Return empty array instead of failing
    }
};

export const nutrifiPlugin: Plugin = {
    name: "[NutriFi] Integration",
    description: "Agent will use this plugin to recommend healthy meals based on user fitness goals and diet preferences",
    actions: await initializeActions(),
    evaluators: [nutritionGoalsEvaluator],
    providers: []
};

// Export everything
export * from "./actions";
export * from "./evaluators";
export * from "./services/uber-eats";
export default nutrifiPlugin;
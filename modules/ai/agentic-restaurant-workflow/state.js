import { MessagesZodState } from "@langchain/langgraph";
import { z } from "zod";

/**
 * Restaurant Discovery Agent State Schema
 *
 * Extends the base `MessagesZodState` with restaurant discovery specific metadata
 * for tracking session context, caching, tool invocation, and restaurant search results.
 *
 * @typedef {Object} RestaurantAgentState
 * @property {string} sessionId - Unique session ID for tracking the user's restaurant discovery session
 * @property {string} [result] - Optional result string, typically the agent's final response
 * @property {"hit" | "miss" | "skip" | "saved" | "error"} [cacheStatus] - Cache status indicator
 * @property {Array<Object>} [toolResults] - Structured tool execution results with metadata
 * @property {Array<Object>} [foundRestaurants] - Restaurants found during search operations
 */
export const RestaurantAgentState = MessagesZodState.extend({
    sessionId: z.string(),
    result: z.string().optional(),
    cacheStatus: z.enum(["hit", "miss", "skip", "saved", "error"]).optional(),
    toolResults: z.array(z.object({
        toolName: z.string(),
        success: z.boolean(),
        error: z.string().optional(),
        result: z.any().optional()
    })).optional(),
    foundRestaurants: z.array(z.object({
        id: z.string(),
        name: z.string(),
        cuisine: z.string().optional(),
        rating: z.number().optional(),
        priceFor2: z.number().optional(),
        city: z.string().optional(),
        locality: z.string().optional(),
        distance: z.number().optional()
    })).optional()
});

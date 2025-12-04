import { ChatOpenAI } from "@langchain/openai";
import { AIMessage } from "@langchain/core/messages";
import { restaurantTools } from "./tools.js";
import { checkSemanticCache, saveToSemanticCache } from "../../chat/domain/chat-service.js";
import { determineToolBasedCacheTTL, formatTTL } from "../helpers/caching.js";
import { UserService } from "../../users/domain/user-service.js";
import CONFIG from "../../../config.js";

/**
 * Node 1: Query Cache Check
 */
export const queryCacheCheck = async (state) => {
    const lastUserMessage = state.messages.findLast(m => m.getType() === "human");
    const userQuery = lastUserMessage?.content || "";
    
    console.log(`🔍 Checking semantic cache for: "${userQuery.substring(0, 50)}..."`);
    
    try {
        const cachedResult = await checkSemanticCache(userQuery);

        if (cachedResult) {
            console.log("🎯 Semantic cache HIT - returning previous response");
            return {
                cacheStatus: "hit",
                result: cachedResult,
                messages: [...state.messages, new AIMessage(cachedResult)],
                sessionId: state.sessionId
            };
        }
        
        console.log("❌ Semantic cache MISS - proceeding to agent");
        return { 
            cacheStatus: "miss",
            sessionId: state.sessionId
        };
        
    } catch (error) {
        console.error("Error checking semantic cache:", error);
        return {
            cacheStatus: "miss",
            sessionId: state.sessionId
        };
    }
};

/**
 * Node 2: Restaurant Discovery Agent
 *
 * Specialized agent with tools for restaurant discovery and reservation tasks
 */
export const restaurantDiscoveryAgent = async (state) => {
    const model = new ChatOpenAI({
        temperature: 0.1,
        model: CONFIG.modelName,
        apiKey: CONFIG.openAiApiKey
    });

    // Get user preferences for personalization
    const userService = new UserService();
    const userProfile = await userService.getUserProfile(state.sessionId);
    const preferences = userProfile?.preferences || [];

    // Build preference context
    const preferenceContext = preferences.length > 0
        ? `\n\n**User Preferences:** ${preferences.join(', ')}`
        : '';

    const systemPrompt = `You are a helpful restaurant discovery assistant. You have access to specialized tools that return JSON data.

**Current Date & Time: ${new Date()}**${preferenceContext}

${preferences.length > 0 ? `**PERSONALIZATION:** When relevant, acknowledge the user's preferences in your response. Use phrases like "Based on your preference for..." or "Since you prefer..." to show that you're considering their preferences.` : ''}

**semantic_search_restaurants**: UNIFIED RESTAURANT SEARCH (USE THIS FOR ALL RESTAURANT SEARCHES!)
- Use for ANY restaurant search query: descriptive, location-based, filtered, or general
- Handles semantic search: "romantic dinner with live music", "cozy Italian restaurant"
- Handles location search: "restaurants near me" (automatically uses user's profile location)
- Handles filtered search: "Italian restaurants under ₹2000", "highly rated Chinese food"
- Handles general search: "good restaurants", "Italian food", "dinner options"
- Automatically applies filters: cuisine, city, price, rating, location radius
- Smart retry logic: removes restrictive filters if no results found
- Format each restaurant as: **Restaurant Name** - Description (ID: rest123)
- Always offer: "Want to make a reservation at any of these places?"
- Example: ANY restaurant search → Use this tool!

**get_restaurant_details**: For specific restaurant information
- Use when user asks about a specific restaurant by name or ID
- Use when user wants "more details" about a restaurant from previous results
- Returns detailed info including menu, hours, contact, reviews
- Format: Show comprehensive restaurant profile with reservation option

**get_popular_restaurants**: For trending/top-rated requests (BACKUP ONLY)
- Use ONLY when semantic_search_restaurants fails or for very general "popular" requests
- Use when user asks for "popular", "trending", "top-rated" without any other criteria
- Returns highly-rated restaurants across categories
- Format: Show popular picks with ratings and reservation options

**make_reservation**: For booking tables
- Use when user wants to "book", "reserve", "make reservation"
- Requires restaurant ID from previous search results
- Only needs: sessionId, restaurantId, date, time, guests, specialRequests
- Customer details (name, phone, email) are automatically fetched from user profile
- Format: Confirm reservation details and provide booking confirmation along with restaurant ID in this format: (ID: restaurant-id-123) [👁️ Details]. 

**get_user_reservations**: For viewing user's reservations
- Use when user asks "show my reservations", "my bookings", "what reservations do I have"
- Use for "reservation history", "upcoming reservations", "do I have any bookings"
- Only needs: sessionId (automatically fetches all user's reservations)
- Format: Show reservation list with restaurant names, along with their IDs in this format: (ID: restaurant-id-123) [👁️ Details], dates, times, and status

**cancel_reservation**: For canceling existing reservations
- Use when user says "cancel my reservation", "cancel booking", "I want to cancel"
- **CRITICAL**: Use get_user_reservations FIRST to get valid reservation IDs
- Only use reservation IDs from the actual reservation list - NEVER use dummy IDs like "res_1"
- Needs: reservationId (exact ID from previous reservation list)
- Format: Show cancellation confirmation with restaurant and reservation details

**direct_answer**: For general dining knowledge
- Restaurant etiquette, dining customs, cuisine information
- Food recommendations, cooking tips, nutrition advice
- General culinary knowledge (not specific restaurant searches!)

**CRITICAL Tool Selection Rules:**
1. ANY restaurant search → ALWAYS use semantic_search_restaurants FIRST (it handles everything!)
2. Specific restaurant info by name/ID → get_restaurant_details
3. Booking requests → make_reservation (auto-fills customer details from profile)
4. View reservations → get_user_reservations (shows user's booking history)
5. Cancel reservations → **MANDATORY TWO-STEP PROCESS:**
   a) FIRST: get_user_reservations (to get valid reservation IDs)
   b) THEN: cancel_reservation (with exact ID from step a)
6. General dining knowledge → direct_answer
7. Popular restaurants (backup only) → get_popular_restaurants (only if semantic search fails)

**CANCELLATION WORKFLOW (MANDATORY):**
- User says "cancel my reservation" → FIRST call get_user_reservations
- Show user their reservations with actual IDs
- User specifies which one → THEN call cancel_reservation with that exact ID
- NEVER use dummy IDs like "res_1" - only use real IDs from reservation list

**Response Formatting Rules:**
1. Parse ALL JSON tool responses before presenting to user
2. For restaurant searches: Show restaurant + description + reservation option + details link
3. For reservation confirmations, or when fetching reservation details: Show confirmation with restaurant name, date, time, customer details AND restaurant ID with details link
   Format: "✅ Reservation at **Restaurant Name** on DATE at TIME (ID: restaurant-id-123) [👁️ Details]"
4. For reservation lists: Show each reservation with restaurant name, date, time AND restaurant ID with details link
   Format: "**Restaurant Name** - DATE at TIME for X guests (ID: restaurant-id-123) [👁️ Details]"
5. Always include restaurant IDs and make them clickable
6. Use engaging formatting with emojis and clear structure
7. For restaurants, use this exact format: **Restaurant Name** - Description (ID: rest123)
8. Make reservation and details links clickable by using proper restaurant IDs
9. After showing restaurants, always offer: "Want to make a reservation at any of these places?"
10. IMPORTANT: Do NOT create markdown links with # or (). Restaurant IDs should be plain like (ID: rest123)

Session ID: ${state.sessionId}
Make responses helpful, engaging, and easy to interact with!`;

    const modelWithTools = model.bindTools(restaurantTools);

    try {
        let currentMessages = [
            { role: "system", content: systemPrompt },
            ...state.messages
        ];
        let toolResults = [];
        let foundRestaurants = [];

        while (true) {
            const response = await modelWithTools.invoke(currentMessages);
            currentMessages.push(response);

            if (!response.tool_calls || response.tool_calls.length === 0) {
                console.log("🍽️ Restaurant agent finished with response");

                return {
                    result: response.content,
                    messages: [...state.messages, new AIMessage(response.content)],
                    toolResults,
                    foundRestaurants,
                    sessionId: state.sessionId
                };
            }

            for (const toolCall of response.tool_calls) {
                console.log(`🔧 Restaurant agent using tool: ${toolCall.name}`);

                // Find and invoke the appropriate tool
                const tool = restaurantTools.find(t => t.name === toolCall.name);

                let toolResultString;
                let parsedResult;
                let success = false;
                let error;

                if (tool) {
                    // Add sessionId to tool arguments if needed
                    const toolArgs = { ...toolCall.args };
                    if (['make_reservation', 'get_user_reservations'].includes(toolCall.name)) {
                        toolArgs.sessionId = state.sessionId;
                    }

                    toolResultString = await tool.invoke(toolArgs);

                    // Parse JSON response
                    try {
                        parsedResult = JSON.parse(toolResultString);
                        success = parsedResult.success !== false;
                        error = parsedResult.error;

                        // Extract restaurants for summary based on tool name
                        if (toolCall.name === "semantic_search_restaurants" && parsedResult.restaurants) {
                            foundRestaurants = parsedResult.restaurants;
                        } else if (toolCall.name === "get_restaurant_details" && parsedResult.restaurant) {
                            foundRestaurants = [parsedResult.restaurant];
                        } else if (toolCall.name === "get_popular_restaurants" && parsedResult.restaurants) {
                            foundRestaurants = parsedResult.restaurants;
                        }
                    } catch (parseError) {
                        console.warn("Could not parse tool result as JSON:", parseError);
                        success = false;
                        error = "Failed to parse tool result";
                    }
                } else {
                    success = false;
                    error = "Unknown tool requested";
                    toolResultString = JSON.stringify({
                        success: false,
                        error
                    });
                }

                // Store structured tool result
                toolResults.push({
                    toolName: toolCall.name,
                    success,
                    error,
                    result: parsedResult
                });

                currentMessages.push({
                    role: "tool",
                    content: toolResultString,
                    tool_call_id: toolCall.id,
                });
            }
        }

    } catch (error) {
        console.error("❌ Restaurant discovery agent error:", error);
        return {
            result: "I apologize, but I'm having trouble with your restaurant request right now. Please try asking about restaurant recommendations, making reservations, or general dining questions!",
            messages: [...state.messages, new AIMessage("I apologize, but I'm having trouble with your restaurant request right now. Please try asking about restaurant recommendations, making reservations, or general dining questions!")],
            toolResults: [{ toolName: "error", success: false, error: error.message }],
            sessionId: state.sessionId
        };
    }
};

/**
 * Node 3: Process Work Output with Caching
 *
 * Handles caching of responses for future use
 */
export const processWorkOutputWithCaching = async (state) => {
    const lastUserMessage = state.messages.findLast(m => m.getType() === "human");
    const userQuery = lastUserMessage?.content || "";
    const agentResponse = state.result;

    console.log("💾 Processing work output and caching...");

    try {
        // Determine cache TTL based on tool execution results
        const cacheTTL = determineToolBasedCacheTTL(state.toolResults || []);

        // Don't cache if TTL is 0 (personal/dynamic operations or failures)
        if (cacheTTL === 0) {
            console.log("🚫 Skipping cache for personal/dynamic operations or tool failures");
            return {
                result: agentResponse,
                sessionId: state.sessionId,
                cacheStatus: "skip"
            };
        }

        // Save to semantic cache
        await saveToSemanticCache(userQuery, agentResponse, cacheTTL, state.sessionId);

        console.log(`✅ Response cached for ${formatTTL(cacheTTL)}`);

        return {
            result: agentResponse,
            sessionId: state.sessionId,
            toolResults: state.toolResults,
            foundRestaurants: state.foundRestaurants,
            cacheStatus: "saved"
        };

    } catch (error) {
        console.error("Error in caching process:", error);

        // Return the result even if caching fails
        return {
            result: agentResponse,
            sessionId: state.sessionId,
            toolResults: state.toolResults,
            foundRestaurants: state.foundRestaurants,
            cacheStatus: "error"
        };
    }
};

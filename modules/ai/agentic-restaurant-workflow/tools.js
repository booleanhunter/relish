import { tool } from "@langchain/core/tools";
import { HumanMessage } from "@langchain/core/messages";
import { ChatOpenAI } from "@langchain/openai";

import { z } from "zod";

// Import service functions
import { RestaurantService } from '#modules/restaurants/domain/restaurant-service.js';
import { ReservationService } from '#modules/reservations/domain/reservation-service.js';

// Import helper functions
import { AppError, HttpStatusCode } from '#lib/errors.js';
import CONFIG from '#config';

const restaurantService = new RestaurantService();
const reservationService = new ReservationService();

/**
 * Tool: Find Restaurants
 * Primary tool for finding restaurants with filters
 */
export const findRestaurantsTool = tool(
    async (args) => {
        try {
            // Call service with all arguments (service handles user location, embedding generation, and fallbacks)
            const result = await restaurantService.findRestaurants(args);

            // Format response as JSON string for LangChain
            return JSON.stringify({
                success: result.restaurants.length > 0,
                query: args.query,
                totalFound: result.totalFound,
                restaurants: result.restaurants,
                searchParams: {
                    query: args.query,
                    location: !!(result.filters.latitude && result.filters.longitude),
                    filters: {
                        cuisine: args.cuisine,
                        city: args.city,
                        locality: args.locality,
                        type: args.type,
                        maxPrice: args.maxPrice,
                        minRating: args.minRating
                    }
                },
                message: result.restaurants.length > 0
                    ? `Found ${result.restaurants.length} restaurants matching your preferences.`
                    : `No restaurants found matching your criteria. Try different keywords or filters.`,
            });

        } catch (error) {
            console.error('Error in restaurant search:', error);
            return JSON.stringify({
                success: false,
                error: `Sorry, I had trouble searching for restaurants. Please try rephrasing your request.`,
            });
        }
    },
    {
        name: "find_restaurants",
        description: "Primary tool for finding restaurants. Handles all restaurant queries with text search, location-based search, and filters. Use for ANY restaurant search query.",
        schema: z.object({
            query: z.string().optional().describe("Search query (e.g., 'romantic dinner with live music', 'Italian restaurant', 'good food')"),
            sessionId: z.string().optional().describe("User session ID"),
            latitude: z.number().optional().describe("Latitude coordinate for location-based search"),
            longitude: z.number().optional().describe("Longitude coordinate for location-based search"),
            radius: z.number().optional().describe("Search radius in kilometers (default: 15)"),
            cuisine: z.string().optional().describe("Cuisine filter (e.g., 'Italian', 'Chinese', 'Indian')"),
            city: z.string().optional().describe("City filter (e.g., 'Delhi', 'Mumbai')"),
            locality: z.string().optional().describe("Locality filter (e.g., 'Khan Market', 'Connaught Place')"),
            type: z.string().optional().describe("Restaurant type filter (e.g., 'Fine Dining', 'Casual Dining', 'Quick Bites')"),
            maxPrice: z.number().optional().describe("Maximum price for 2 people"),
            minRating: z.number().optional().describe("Minimum rating filter (e.g., 4.0)"),
            limit: z.number().optional().describe("Maximum number of results (default: 15, max: 50)"),
        })
    }
);

/**
 * Tool: Get Restaurant Details
 * Get detailed information about a specific restaurant
 */
export const getRestaurantDetailsTool = tool(
    async ({ restaurantId }) => {
        console.log(`🏪 Getting details for restaurant: ${restaurantId}`);

        try {
            const restaurant = await restaurantService.getRestaurantById(restaurantId);

            return JSON.stringify({
                success: true,
                restaurant: restaurant,
                message: `Here are the details for ${restaurant.name}.`,
            });

        } catch (error) {
            console.error('Error getting restaurant details:', error);
            return JSON.stringify({
                success: false,
                error: `Sorry, I couldn't find details for that restaurant. Please check the restaurant ID.`,
            });
        }
    },
    {
        name: "get_restaurant_details",
        description: "🔍 RESTAURANT DETAILS - Get comprehensive information about a specific restaurant. Use when user asks 'tell me more about [restaurant]' or wants details about a restaurant from previous search results. Returns full restaurant profile.",
        schema: z.object({
            restaurantId: z.string().describe("The unique restaurant ID (e.g., 'tonino-6fbacd23') from previous search results"),
        })
    }
);

/**
 * Tool: Make Reservation
 * Create a restaurant reservation using customer details from user profile
 */
export const makeReservationTool = tool(
    async ({ sessionId, restaurantId, date, time, guests, specialRequests }) => {
        console.log(`📅 Making reservation for restaurant: ${restaurantId}`);

        try {
            const result = await reservationService.createReservation({
                sessionId,
                restaurantId,
                date,
                time,
                guests: parseInt(guests),
                specialRequests,
            });

            return JSON.stringify({
                success: true,
                reservation: result.reservation,
                restaurant: result.restaurant,
                message: `✅ Reservation confirmed at **${result.restaurant.name}** on ${date} at ${time} for ${guests} guests (ID: ${result.restaurant.id})`,
            });

        } catch (error) {
            console.error('Error making reservation:', error);
            return JSON.stringify({
                success: false,
                error: `Sorry, I couldn't make the reservation. ${error.message || 'Please try again.'}`,
            });
        }
    },
    {
        name: "make_reservation",
        description: "📅 MAKE RESERVATION - Book a table at a restaurant using customer details from user profile. Use when user says 'book', 'reserve', 'make reservation'. Automatically uses their saved contact information.",
        schema: z.object({
            sessionId: z.string().describe("User session ID to fetch customer details from profile"),
            restaurantId: z.string().describe("Restaurant ID from previous search (e.g., 'tonino-6fbacd23')"),
            date: z.string().describe("Reservation date in YYYY-MM-DD format (e.g., '2024-11-15')"),
            time: z.string().describe("Reservation time in HH:MM format (e.g., '19:00')"),
            guests: z.string().describe("Number of guests (e.g., '2', '4')"),
            specialRequests: z.string().optional().describe("Special requests, dietary requirements, or occasion notes"),
        })
    }
);

/**
 * Tool: Get User Reservations
 * Fetch all reservations for a user session
 */
export const getUserReservationsTool = tool(
    async ({ sessionId }) => {
        console.log(`📋 Getting reservations for session: ${sessionId}`);

        try {
            const result = await reservationService.getSessionReservations(sessionId);

            // Format reservations with restaurant IDs
            const formattedReservations = result.reservations.map(reservation => {
                const restaurantName = reservation.restaurant ? reservation.restaurant.name : 'Unknown Restaurant';
                return `**${restaurantName}** - ${reservation.date} at ${reservation.time} for ${reservation.guests} guests (ID: ${reservation.restaurantId})`;
            }).join('\n');

            const message = result.summary.totalReservations > 0
                ? `📋 **Your Reservations:**\n\n${formattedReservations}`
                : "You don't have any reservations yet.";

            return JSON.stringify({
                success: true,
                reservations: result.reservations,
                summary: result.summary,
                message: message
            });

        } catch (error) {
            console.error('Error getting user reservations:', error);
            return JSON.stringify({
                success: false,
                error: `Sorry, I couldn't retrieve your reservations. ${error.message || 'Please try again.'}`
            });
        }
    },
    {
        name: "get_user_reservations",
        description: "📋 GET RESERVATIONS - Fetch all reservations for the current user. Use when user asks 'show my reservations', 'my bookings', 'what reservations do I have', or wants to see their reservation history.",
        schema: z.object({
            sessionId: z.string().describe("User session ID to fetch reservations for")
        })
    }
);

/**
 * Tool: Cancel Reservation
 * Cancel an existing reservation for the user
 */
export const cancelReservationTool = tool(
    async ({ reservationId }) => {
        console.log(`❌ Canceling reservation: ${reservationId}`);

        try {
            const result = await reservationService.cancelReservation(reservationId);

            return JSON.stringify({
                success: true,
                reservation: result.reservation,
                restaurant: result.restaurant,
                message: `Your reservation at ${result.restaurant.name} on ${result.reservation.date} at ${result.reservation.time} has been successfully canceled.`
            });

        } catch (error) {
            console.error('Error canceling reservation:', error);
            return JSON.stringify({
                success: false,
                error: `Sorry, I couldn't cancel your reservation. ${error.message || 'Please try again.'}`
            });
        }
    },
    {
        name: "cancel_reservation",
        description: "❌ CANCEL RESERVATION - Cancel an existing reservation. Use ONLY with a valid reservation ID from a previous reservation list. ALWAYS call get_user_reservations first to get valid reservation IDs.",
        schema: z.object({
            reservationId: z.string().describe("Exact reservation ID from previous reservation list (e.g., 'reservation_abc123')")
        })
    }
);

/**
 * Tool: Direct Answer
 * Returns structured data with the answer content for general restaurant questions
 */
export const directAnswerTool = tool(
    async ({ question }) => {
        console.log(`🧠 Direct answer for: "${question}"`);

        try {
            // Direct LLM call for general questions
            const model = new ChatOpenAI({
                temperature: 0.2,
                model: CONFIG.modelName,
                apiKey: CONFIG.openAiApiKey
            });

            const systemPrompt = `You are a knowledgeable restaurant and dining assistant. Answer questions about:
- Restaurant recommendations and cuisine types
- Dining etiquette and customs
- Food preparation and cooking methods
- Restaurant industry insights
- Local dining culture and trends

Keep responses helpful, informative, and concise. If the question requires specific restaurant data, suggest using restaurant search tools instead.`;

            const response = await model.invoke([
                { role: "system", content: systemPrompt },
                new HumanMessage(question)
            ]);

            return JSON.stringify({
                success: true,
                answer: response.content,
                message: response.content
            });

        } catch (error) {
            console.error('Error in direct answer:', error);
            return JSON.stringify({
                success: false,
                error: "I'm having trouble answering that question right now. Please try rephrasing or ask about specific restaurants."
            });
        }
    },
    {
        name: "direct_answer",
        description: "🧠 GENERAL DINING KNOWLEDGE - Answer general questions about dining, cuisine, etiquette, cooking tips. Use for questions that don't need specific restaurant searches. NOT for finding restaurants!",
        schema: z.object({
            question: z.string().describe("General dining/food question (e.g., 'What is authentic Italian cuisine?', 'Dining etiquette tips')")
        })
    }
);


// Export all tools as an array
export const restaurantTools = [
    findRestaurantsTool,
    getRestaurantDetailsTool,
    makeReservationTool,
    getUserReservationsTool,
    cancelReservationTool,
    directAnswerTool,
];

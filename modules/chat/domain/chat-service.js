import ChatRepository from '#modules/chat/data/chat-repository.js';
import { runRestaurantAgentWorkflow } from '#modules/ai/agentic-restaurant-workflow/index.js';
import CONFIG from '#config';

const chatRepository = new ChatRepository();

/**
 * Get reply from Restaurant AI agent
 * @param {string} sessionId - User session ID
 * @param {string} chatId - Chat ID
 * @param {string} message - User message
 * @param {boolean} useSmartRecall - Whether to use smart recall caching
 */
export async function processRestaurantInquiry(sessionId, chatId, message, useSmartRecall) {
    // run agentic restaurant workflow
    return await runRestaurantAgentWorkflow(sessionId, chatId, message, useSmartRecall);
}

/**
 * Save response to semantic cache
 * @param {string} query - Original user query
 * @param {string} response - Response to cache
 * @param {number} ttlMillis - Time to live in milliseconds
 * @param {string} [sessionId] - Optional user session ID
 */
export async function saveToSemanticCache(query, response, ttlMillis, sessionId) {
    await chatRepository.saveResponseInSemanticCache(
        query,
        response,
        ttlMillis,
        sessionId,
    );
    
    const ttlDays = Math.round(ttlMillis / (24 * 60 * 60 * 1000));
    
    return {
        success: true,
        ttlDays: ttlDays,
        message: "Response cached successfully for future queries.",
    };
}

/**
 * Check semantic cache for similar queries
 * @param {string} query - User query to check
 * @param {string} [sessionId] - Optional user session ID for scoped search
 */
export async function checkSemanticCache(query, sessionId) {
    return chatRepository.findFromSemanticCache(query, sessionId);
}

/**
 * End user session and clear chat data
 * @param {string} sessionId - User session ID
 */
export async function endUserSession(sessionId) {
    return chatRepository.deleteChats(sessionId);
}

/**
 * Get chat history for a session
 * @param {string} sessionId - User session ID
 * @param {string} chatId - Chat ID
 */
export async function getChatHistory(sessionId, chatId) {
    return chatRepository.getOrCreateChatHistory(sessionId, chatId);
}

/**
 * Determine cache TTL based on tool execution results
 * @param {Array<{toolName: string, success: boolean, error?: string, result?: any}>} toolResults - Structured tool execution results
 * @returns {number} TTL in milliseconds (0 = don't cache)
 */
export function determineToolBasedCacheTTL(toolResults = []) {
    // Check if any tool execution failed
    for (const toolResult of toolResults) {
        if (toolResult.success === false) {
            console.log(`⚠️ Tool failure detected (${toolResult.toolName}), skipping cache`);
            return 0; // Don't cache failures
        }
    }

    // Extract tool names for TTL logic
    const toolNames = toolResults.map(tr => tr.toolName);

    // Don't cache personal/dynamic operations
    const personalTools = [
        'make_reservation',
        'get_user_reservations',
        'cancel_reservation'
    ];

    if (personalTools.some(tool => toolNames.includes(tool))) {
        console.log(`🚫 Personal operation detected: ${toolNames.filter(t => personalTools.includes(t)).join(', ')}`);
        return 0; // Don't cache
    }

    // Long TTL for static/popular content (changes rarely)
    const staticTools = [
        'get_popular_restaurants',  // Popular restaurants don't change often
        'direct_answer'            // General knowledge is static
    ];

    if (staticTools.some(tool => toolNames.includes(tool))) {
        console.log(`📚 Static content detected: ${toolNames.filter(t => staticTools.includes(t)).join(', ')}`);
        return 7 * 24 * 60 * 60 * 1000; // 7 days
    }

    // Medium TTL for restaurant searches (restaurants don't change frequently)
    const searchTools = [
        'semantic_search_restaurants'
    ];

    if (searchTools.some(tool => toolNames.includes(tool))) {
        console.log(`🔍 Restaurant search detected: ${toolNames.filter(t => searchTools.includes(t)).join(', ')}`);
        return 24 * 60 * 60 * 1000; // 24 hours
    }

    // Short TTL for specific restaurant details (hours/menu might change)
    const detailTools = [
        'get_restaurant_details'
    ];

    if (detailTools.some(tool => toolNames.includes(tool))) {
        console.log(`🏪 Restaurant details detected: ${toolNames.filter(t => detailTools.includes(t)).join(', ')}`);
        return 6 * 60 * 60 * 1000; // 6 hours
    }

    // Default for direct responses or unknown tools
    console.log(`🤷 Default TTL for tools: ${toolNames.join(', ')}`);
    return 12 * 60 * 60 * 1000; // 12 hours default
}

/**
 * Convert milliseconds to human-readable format
 * @param {number} ms - Milliseconds
 * @returns {string} Human-readable format
 */
export function formatTTL(ms) {
    if (ms === 0) return 'No cache';

    const hours = Math.round(ms / (60 * 60 * 1000));
    const days = Math.round(ms / (24 * 60 * 60 * 1000));

    if (days >= 1) {
        return `${days} day${days > 1 ? 's' : ''}`;
    } else {
        return `${hours} hour${hours > 1 ? 's' : ''}`;
    }
}

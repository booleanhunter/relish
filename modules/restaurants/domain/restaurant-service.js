import { RestaurantRepository } from '#modules/restaurants/data/restaurant-repository.js';
import { UserService } from '#modules/users/domain/user-service.js';
import { AppError, HttpStatusCode } from '#lib/errors.js';
import { generateEmbedding } from '#modules/ai/helpers/embeddings.js';

/**
 * Restaurant Service - Business logic layer for restaurant operations
 * Handles all restaurant-related business rules and validation
 */
export class RestaurantService {
    constructor() {
        this.restaurantRepository = new RestaurantRepository();
        this.userService = new UserService();
    }

    /**
     * Get restaurant by ID with validation
     * @param {string} restaurantId - Restaurant ID
     * @returns {Promise<Object>} Restaurant data
     * @throws {AppError} If restaurant not found
     */
    async getRestaurantById(restaurantId) {
        if (!restaurantId) {
            throw new AppError(
                'INVALID_RESTAURANT_ID',
                'Restaurant ID is required',
                HttpStatusCode.BAD_REQUEST,
            );
        }

        const restaurant = await this.restaurantRepository.getRestaurantById(restaurantId);

        if (!restaurant) {
            throw new AppError(
                'RESTAURANT_NOT_FOUND',
                `Restaurant with ID ${restaurantId} not found`,
                HttpStatusCode.NOT_FOUND,
            );
        }

        return restaurant;
    }

    /**
     * Get restaurant filter options for UI
     * @returns {Promise<Object>} Available filter options
     */
    async getFilterOptions() {
        const stats = await this.restaurantRepository.getRestaurantStats();

        return {
            cuisines: stats.cuisines,
            cities: stats.cities,
            types: stats.types,
            priceRanges: [
                { label: 'Budget (Under ₹500)', min: 0, max: 500 },
                { label: 'Mid-range (₹500-₹1000)', min: 500, max: 1000 },
                { label: 'Premium (₹1000-₹2000)', min: 1000, max: 2000 },
                { label: 'Luxury (Above ₹2000)', min: 2000, max: 10000 }
            ],
            ratingRanges: [
                { label: '4.5+ Stars', min: 4.5 },
                { label: '4.0+ Stars', min: 4.0 },
                { label: '3.5+ Stars', min: 3.5 },
                { label: '3.0+ Stars', min: 3.0 }
            ],
        };
    }

    /**
     * Validate and sanitize search options
     * @private
     * @param {Object} options - Raw search options
     * @returns {Object} Validated and sanitized options
     * @throws {AppError} If options are invalid
     */
    _validateAndSanitizeOptions(options) {
        // Validate coordinates
        this._isValidCoordinates(options.latitude, options.longitude);

        const sanitized = {
            ...options,
            ...(options.limit && { limit: parseInt(options.limit) }),
            ...(options.latitude && { latitude: parseFloat(options.latitude) }),
            ...(options.longitude && { longitude: parseFloat(options.longitude) }),
            ...(options.radius && { radius: parseFloat(options.radius) }),
            ...(options.maxPrice && { maxPrice: parseInt(options.maxPrice) }),
            ...(options.minRating && { minRating: parseFloat(options.minRating) }),
        };

        return sanitized;
    }

    /**
     * Validate location coordinates
     * @private
     * @param {number} latitude - Latitude coordinate
     * @param {number} longitude - Longitude coordinate
     * @throws {AppError} If coordinates are invalid or incomplete
     */
    _isValidCoordinates(latitude, longitude) {
        if (!latitude && !longitude) {
            return false; // No coordinates provided, skip validation
        }
        // If both are provided, validate them
        if (typeof latitude === 'number' && typeof longitude === 'number') {
            const isValidLat = latitude >= -90 && latitude <= 90;
            const isValidLng = longitude >= -180 && longitude <= 180;

            if (isValidLat && isValidLng) {
                return true;
            } else {
                throw new AppError(
                    'INVALID_COORDINATES',
                    'Invalid latitude or longitude provided',
                    HttpStatusCode.BAD_REQUEST,
                );
            }
        } else {
            // One is provided but not the other, or wrong type
            throw new AppError(
                'INVALID_COORDINATES',
                'Both latitude and longitude must be provided for location filtering',
                HttpStatusCode.BAD_REQUEST,
            );
        }
    }

    /**
     * Get restaurant statistics
     * @returns {Promise<Object>} Restaurant statistics
     */
    async getRestaurantStats() {
        return await this.restaurantRepository.getRestaurantStats();
    }

    /**
     * Find restaurants with smart query selection and automatic fallbacks
     * @param {Object} options - Search options and filters
     * @param {string} options.query - Search query (optional, e.g., 'romantic Italian restaurant')
     * @param {string} options.sessionId - User session ID (for fetching user location)
     * @param {number} options.limit - Maximum results (default: 10)
     * @param {number} options.latitude - Latitude for location filter
     * @param {number} options.longitude - Longitude for location filter
     * @param {number} options.radius - Search radius in km (default: 5)
     * @param {string} options.cuisine - Cuisine filter
     * @param {string} options.city - City filter
     * @param {string} options.locality - Locality filter
     * @param {string} options.type - Restaurant type filter
     * @param {number} options.maxPrice - Maximum price filter
     * @param {number} options.minRating - Minimum rating filter
     * @returns {Promise<Object>} Search results with metadata
     */
    async findRestaurants(options = {}) {
        // Validate and sanitize all options
        const sanitized = this._validateAndSanitizeOptions(options);

        // Set defaults
        const limit = sanitized.limit ?? 10;
        const radius = sanitized.radius ?? 5;
        let latitude = sanitized.latitude;
        let longitude = sanitized.longitude;

        // Priority: 1) Use provided coordinates, 2) Fetch from user location if sessionId exists, 3) Proceed without location
        if (!latitude && !longitude && sanitized.sessionId) {
            const userLocation = await this.userService.getUserLocation(sanitized.sessionId);
            if (userLocation) {
                latitude = userLocation.latitude;
                longitude = userLocation.longitude;
                // Re-validate coordinates after fetching from user location
                this._isValidCoordinates(latitude, longitude);
            }
        }

        // Smart query selection: use provided query, or default based on context
        const searchQuery = sanitized.query || (latitude && longitude ? 'restaurant' : 'popular highly rated restaurant');

        // Generate embedding for the search query
        const embedding = await generateEmbedding(searchQuery);

        // Primary search with all filters
        let restaurants = await this.restaurantRepository.findRestaurants(embedding, {
            ...sanitized,
            latitude,
            longitude,
            radius,
            limit: limit * 2, // Request more to allow for filtering
        });

        // Retry logic: if no results and cuisine filter exists, retry without cuisine
        if (restaurants.length === 0 && sanitized.cuisine) {
            const retryEmbedding = await generateEmbedding(searchQuery);
            restaurants = await this.restaurantRepository.findRestaurants(retryEmbedding, {
                ...sanitized,
                latitude,
                longitude,
                radius,
                cuisine: undefined, // Remove cuisine filter for retry
                limit: limit * 2,
            });
        }

        // Final fallback: if still no results, search for popular restaurants
        if (restaurants.length === 0) {
            const fallbackEmbedding = await generateEmbedding('popular highly rated restaurant');
            restaurants = await this.restaurantRepository.findRestaurants(fallbackEmbedding, {
                city: sanitized.city,
                minRating: 4.0,
                limit,
            });
        }

        // Limit final results
        const finalRestaurants = restaurants.slice(0, limit);

        return {
            restaurants: finalRestaurants,
            totalFound: finalRestaurants.length,
            searchType: 'semantic',
            filters: {
                latitude,
                longitude,
                radius,
                cuisine: sanitized.cuisine,
                city: sanitized.city,
                locality: sanitized.locality,
                type: sanitized.type,
                maxPrice: sanitized.maxPrice,
                minRating: sanitized.minRating
            },
            timestamp: new Date().toISOString(),
        };
    }

    /**
     * Check if restaurant exists
     * @param {string} restaurantId - Restaurant ID
     * @returns {Promise<boolean>} True if restaurant exists
     */
    async restaurantExists(restaurantId) {
        if (!restaurantId) {
            return false;
        }
        return await this.restaurantRepository.restaurantExists(restaurantId);
    }
}

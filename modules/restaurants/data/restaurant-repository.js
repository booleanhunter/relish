import { createClient } from 'redis';
import { AppError, HttpStatusCode } from '#lib/errors.js';
import CONFIG from '#config';

const client = await createClient({
    url: CONFIG.redisUrl,
}).on('error', (err) => console.log('Redis Client Error', err))
  .connect();

/**
 * Restaurant Repository - Data access layer for restaurant operations
 * Handles all Redis operations for restaurant data
 */
export class RestaurantRepository {
    constructor() {
        this.keyPrefix = 'restaurants:';
        this.indexName = 'restaurants:search';
    }

    /**
     * Get restaurant by ID
     * @param {string} restaurantId - Restaurant ID
     * @returns {Promise<Object|null>} Restaurant data or null if not found
     */
    async getRestaurantById(restaurantId) {
        try {
            const key = `${this.keyPrefix}${restaurantId}`;
            const restaurant = await client.hGetAll(key);

            if (!restaurant || Object.keys(restaurant).length === 0) {
                return null;
            }

            return restaurant;
        } catch (error) {
            console.error('Error getting restaurant by ID:', error);
            throw new AppError(
                'RESTAURANT_FETCH_ERROR',
                `Failed to fetch restaurant with ID: ${restaurantId}`,
                HttpStatusCode.INTERNAL_SERVER_ERROR,
            );
        }
    }

    /**
     * Find restaurants using semantic search
     * @param {Array<number>} queryVector - Query embedding vector
     * @param {number} limit - Maximum results
     * @param {number} threshold - Similarity threshold
     * @returns {Promise<Array>} Array of restaurants with similarity scores
     */
    async findRestaurants(queryVector, options = {}) {
        const {
            limit = 10,
            latitude,
            longitude,
            radius = 5,
            cuisine,
            city,
            locality,
            type,
            maxPrice,
            minRating,
        } = options;

        let filters = [];

        if (latitude && longitude) {
            filters.push(`@lngLat:[${longitude} ${latitude} ${radius} km]`);
        }
        if (cuisine) {
            filters.push(`@cuisine:{${cuisine}}`);
        }
        if (city) {
            filters.push(`@city:{${city}}`);
        }
        if (locality) {
            filters.push(`@locality:{${locality}}`);
        }
        if (type) {
            filters.push(`@type:{${type}}`);
        }
        if (maxPrice) {
            filters.push(`@priceFor2:[0 ${maxPrice}]`);
        }
        if (minRating) {
            filters.push(`@rating:[${minRating} +inf]`);
        }

        let filterQuery = filters.length > 0 ? filters.join(' ') : '*';
        let vectorQuery = `(${filterQuery})=>[KNN ${limit} @embedding $query_vector AS score]`;

        const searchResults = await client.ft.search(
            this.indexName,
            vectorQuery,
            {
                PARAMS: {
                    query_vector: Buffer.from(new Float32Array(queryVector).buffer)
                },
                LIMIT: { from: 0, size: limit },
                RETURN: ['name', 'cuisine', 'city', 'locality', 'type', 'priceFor2', 'rating', 'about', 'knownFor', 'score'],
                DIALECT: 2,
            }
        );

        // KNN results are already sorted by similarity (ascending score = better match)
        return searchResults.documents.map(doc => ({
            id: doc.id.replace(this.keyPrefix, ''),
            ...doc.value,
            semanticScore: parseFloat(doc.value.score || 0)
        }));
    }

    /**
     * Get all unique values for a field (for filters)
     * @param {string} field - Field name (cuisine, city, locality, type)
     * @returns {Promise<Array>} Array of unique values
     */
    async getUniqueFieldValues(field) {
        const searchResults = await client.ft.search(this.indexName, '*', {
            RETURN: [field],
            LIMIT: { from: 0, size: 10000 }, // Get all for aggregation
        });

        const values = new Set();
        searchResults.documents.forEach(doc => {
            if (doc.value[field]) {
                values.add(doc.value[field]);
            }
        });

        return Array.from(values).sort();
    }

    /**
     * Get restaurant statistics
     * @returns {Promise<Object>} Restaurant statistics
     */
    async getRestaurantStats() {
        const totalResults = await client.ft.search(this.indexName, '*', {
            LIMIT: { from: 0, size: 0 } // Just get count
        });

        const cuisines = await this.getUniqueFieldValues('cuisine');
        const cities = await this.getUniqueFieldValues('city');
        const types = await this.getUniqueFieldValues('type');

        return {
            totalRestaurants: totalResults.total,
            totalCuisines: cuisines.length,
            totalCities: cities.length,
            totalTypes: types.length,
            cuisines,
            cities,
            types,
        };
    }

    /**
     * Check if restaurant exists
     * @param {string} restaurantId - Restaurant ID
     * @returns {Promise<boolean>} True if restaurant exists
     */
    async restaurantExists(restaurantId) {
        const key = `${this.keyPrefix}${restaurantId}`;
        const exists = await client.exists(key);
        return exists === 1;
    }
}

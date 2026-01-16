import { Router } from 'express';
import { RestaurantService } from '#modules/restaurants/domain/restaurant-service.js';

import { AppError, HttpStatusCode } from '#lib/errors.js';

const router = Router();
const restaurantService = new RestaurantService();

/**
 * GET /api/restaurants - Unified restaurant search
 * Query parameters:
 * - query: search query (e.g., 'romantic Italian restaurant', 'pizza')
 * - latitude: latitude for location-based search
 * - longitude: longitude for location-based search
 * - radius: search radius in kilometers (default: 5, max: 50)
 * - cuisine: cuisine filter
 * - city: city filter
 * - locality: locality filter
 * - type: restaurant type filter
 * - maxPrice: maximum price filter
 * - minRating: minimum rating filter
 * - limit: maximum results (default: 10, max: 50)
 */
router.get('/', async (req, res, next) => {
    try {
        // Service handles validation and parsing
        const result = await restaurantService.findRestaurants(req.query);

        res.json({
            success: true,
            data: result
        });
    } catch (error) {
        next(error);
    }
});



/**
 * GET /api/restaurants/filters - Get available filter options
 */
router.get('/filters', async (req, res, next) => {
    try {
        const filterOptions = await restaurantService.getFilterOptions();
    
        res.json({
            success: true,
            data: filterOptions,
        });
    } catch (error) {
        next(error);
    }
});

/**
 * GET /api/restaurants/stats - Get restaurant statistics
 */
router.get('/stats', async (req, res, next) => {
    try {
        const stats = await restaurantService.getRestaurantStats();
    
        res.json({
            success: true,
            data: stats,
        });
    } catch (error) {
        next(error);
    }
});

export default router;

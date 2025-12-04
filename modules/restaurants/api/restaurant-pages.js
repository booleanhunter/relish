import { Router } from 'express';
import { RestaurantService } from '../domain/restaurant-service.js';
import CONFIG from '../../../config.js';

const router = Router();
const restaurantService = new RestaurantService();

/* GET restaurant details page (HTML view) */
router.get('/:restaurantId', async function(req, res, next) {
	const { restaurantId } = req.params;

	try {
		const restaurant = await restaurantService.getRestaurantById(restaurantId);
		
		if (!restaurant) {
			return res.status(404).render('error', { 
				message: 'Restaurant not found',
				error: { status: 404 },
			});
		}

		res.render('restaurant', { 
			app_name: CONFIG.appName || 'Relish',
			restaurant: restaurant,
		});
	} catch (error) {
		console.error('Error loading restaurant page:', error);
		res.status(500).render('error', {
			message: 'Failed to load restaurant',
			error: { status: 500 },
		});
	}
});

export default router;


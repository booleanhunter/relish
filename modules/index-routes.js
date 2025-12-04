import { Router } from 'express';
import CONFIG from '../config.js';
import { UserService } from './users/domain/user-service.js';

const router = Router();
const userService = new UserService();

/* GET home page - directly serve the chat interface */
router.get('/', async function(req, res, next) {
	try {
		// Get sessionId from URL params (same as client-side SessionService)
		const sessionId = req.query.sessionId || req.query.name || 'foodie';

		// Get user profile including locality
		const userProfile = await userService.getUserProfile(sessionId.toLowerCase());
		res.render('chat', {
			app_name: CONFIG.appName || 'Relish',
			user: userProfile || { name: sessionId.charAt(0).toUpperCase() + sessionId.slice(1), locality: 'Unknown Location' }
		});
	} catch (error) {
		console.error('Error loading user profile:', error);
		res.render('chat', {
			app_name: CONFIG.appName || 'Relish',
			user: { name: 'Guest', locality: 'Unknown Location' }
		});
	}
});

export default router;


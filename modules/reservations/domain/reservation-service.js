import { ReservationRepository } from '#modules/reservations/data/reservation-repository.js';
import { UserService } from '#modules/users/domain/user-service.js';
import { RestaurantService } from '#modules/restaurants/domain/restaurant-service.js';
import { AppError, ErrorType } from '#lib/errors.js';

/**
 * Reservation Service - Business logic layer for reservation operations
 * Handles all reservation-related business rules and validation
 */
export class ReservationService {
    constructor() {
        this.reservationRepository = new ReservationRepository();
        this.userService = new UserService();
        this.restaurantService = new RestaurantService();
    }

    /**
     * Create a new reservation with validation
     * @param {Object} reservationData - Reservation data
     * @param {string} reservationData.sessionId - User session ID
     * @param {string} reservationData.restaurantId - Restaurant ID
     * @param {string} reservationData.date - Reservation date (YYYY-MM-DD)
     * @param {string} reservationData.time - Reservation time (HH:MM)
     * @param {number} reservationData.guests - Number of guests
     * @param {string} reservationData.customerName - Customer name
     * @param {string} reservationData.customerPhone - Customer phone
     * @param {string} reservationData.customerEmail - Customer email (optional)
     * @param {string} reservationData.specialRequests - Special requests (optional)
     * @returns {Promise<Object>} Created reservation with restaurant details
     */
    async createReservation(reservationData) {
        const {
            sessionId,
            restaurantId,
            date,
            time,
            guests,
            specialRequests,
        } = reservationData;

        // Get customer details from user profile
        const customerDetails = await this.userService.getUserContactDetails(sessionId);



        // Create reservation
        const reservation = await this.reservationRepository.createReservation({
            sessionId,
            restaurantId,
            date,
            time,
            guests,
            customerName: customerDetails.name.trim(),
            customerPhone: customerDetails.phone.trim(),
            customerEmail: customerDetails.email ? customerDetails.email.trim() : null,
            specialRequests: specialRequests ? specialRequests.trim() : null,
        });

        // Get restaurant details for response
        const restaurant = await this.restaurantService.getRestaurantById(restaurantId);

        return {
            reservation,
            restaurant: {
                id: restaurant.id,
                name: restaurant.name,
                cuisine: restaurant.cuisine,
                address: restaurant.address,
                city: restaurant.city,
                locality: restaurant.locality,
            }
        };
    }

    /**
     * Get reservation by ID with validation
     * @param {string} reservationId - Reservation ID
     * @returns {Promise<Object>} Reservation with restaurant details
     */
    async getReservationById(reservationId) {
        if (!reservationId) {
            throw new AppError(
                `reservation.${ErrorType.INVALID_INPUT}`,
                'Reservation ID is required',
                ErrorType.INVALID_INPUT,
                {
                    publicMessage: 'Reservation ID is required'
                }
            );
        }

        const reservation = await this.reservationRepository.getReservationById(reservationId);

        if (!reservation) {
            throw new AppError(
                `reservation.${ErrorType.NOT_FOUND}`,
                `Reservation with ID ${reservationId} not found`,
                ErrorType.NOT_FOUND,
                {
                    publicMessage: 'Reservation not found',
                    data: { reservationId }
                }
            );
        }

        // Get restaurant details
        const restaurant = await this.restaurantService.getRestaurantById(reservation.restaurantId);

        return {
            reservation,
            restaurant: {
                id: restaurant.id,
                name: restaurant.name,
                cuisine: restaurant.cuisine,
                address: restaurant.address,
                city: restaurant.city,
                locality: restaurant.locality,
            }
        };
    }

    /**
     * Get reservations for a session
     * @param {string} sessionId - Session ID
     * @returns {Promise<Object>} Session reservations with summary
     */
    async getSessionReservations(sessionId) {
        if (!sessionId) {
            throw new AppError(
                `reservation.${ErrorType.INVALID_INPUT}`,
                'Session ID is required',
                ErrorType.INVALID_INPUT,
                {
                    publicMessage: 'Session ID is required'
                }
            );
        }

        const reservations = await this.reservationRepository.getReservationsBySession(sessionId);

        // Enhance reservations with restaurant details
        const enhancedReservations = [];
        for (const reservation of reservations) {
            try {
                const restaurant = await this.restaurantService.getRestaurantById(reservation.restaurantId);
                enhancedReservations.push({
                    ...reservation,
                    restaurant: {
                        name: restaurant.name,
                        cuisine: restaurant.cuisine,
                        city: restaurant.city,
                        locality: restaurant.locality,
                    }
                });
            } catch (error) {
                // If restaurant not found, include reservation without restaurant details
                enhancedReservations.push({
                    ...reservation,
                    restaurant: null,
                });
            }
        }

        // Calculate summary
        const summary = this._calculateReservationSummary(enhancedReservations);

        return {
            reservations: enhancedReservations,
            summary,
        };
    }

    /**
     * Cancel a reservation
     * @param {string} reservationId - Reservation ID
     * @param {string} sessionId - Session ID (for authorization)
     * @returns {Promise<Object>} Cancelled reservation with restaurant details
     */
    async cancelReservation(reservationId, sessionId) {
        if (!reservationId || !sessionId) {
            throw new AppError(
                `reservation.${ErrorType.INVALID_INPUT}`,
                'Reservation ID and Session ID are required',
                ErrorType.INVALID_INPUT,
                {
                    publicMessage: 'Reservation ID and Session ID are required'
                }
            );
        }

        const reservation = await this.reservationRepository.getReservationById(reservationId);

        if (!reservation) {
            throw new AppError(
                `reservation.${ErrorType.NOT_FOUND}`,
                `Reservation with ID ${reservationId} not found`,
                ErrorType.NOT_FOUND,
                {
                    publicMessage: 'Reservation not found',
                    data: { reservationId }
                }
            );
        }

        // Check if reservation belongs to session
        if (reservation.sessionId !== sessionId) {
            throw new AppError(
                `reservation.${ErrorType.FORBIDDEN}`,
                'You can only cancel your own reservations',
                ErrorType.FORBIDDEN,
                {
                    publicMessage: 'You can only cancel your own reservations',
                    data: { reservationId, sessionId }
                }
            );
        }

        // Check if reservation can be cancelled
        if (reservation.status === 'cancelled') {
            throw new AppError(
                `reservation.${ErrorType.CONFLICT}`,
                'Reservation is already cancelled',
                ErrorType.CONFLICT,
                {
                    publicMessage: 'Reservation is already cancelled',
                    data: { reservationId, status: reservation.status }
                }
            );
        }

        if (reservation.status === 'completed') {
            throw new AppError(
                `reservation.${ErrorType.CONFLICT}`,
                'Cannot cancel a completed reservation',
                ErrorType.CONFLICT,
                {
                    publicMessage: 'Cannot cancel a completed reservation',
                    data: { reservationId, status: reservation.status }
                }
            );
        }

        // Check cancellation time policy (e.g., must cancel at least 15 minutes before)
        const reservationDateTime = new Date(`${reservation.date} ${reservation.time}`);
        const now = new Date();
        const minutesUntilReservation = (reservationDateTime - now) / (1000 * 60);

        if (minutesUntilReservation < 15) {
            throw new AppError(
                `reservation.${ErrorType.CONFLICT}`,
                'Reservations must be cancelled at least 15 minutes in advance',
                ErrorType.CONFLICT,
                {
                    publicMessage: 'Reservations must be cancelled at least 15 minutes in advance',
                    data: { reservationId, minutesUntilReservation }
                }
            );
        }

        // Cancel the reservation using updateReservationStatus with cancelledAt metadata
        const cancelledReservation = await this.reservationRepository.updateReservationStatus(
            reservationId,
            reservation,
            'cancelled',
        );

        // Get restaurant details for response
        const restaurant = await this.restaurantService.getRestaurantById(reservation.restaurantId);

        return {
            reservation: cancelledReservation,
            restaurant: {
                id: restaurant.id,
                name: restaurant.name,
                cuisine: restaurant.cuisine,
                address: restaurant.address,
                city: restaurant.city,
                locality: restaurant.locality,
            }
        };
    }

    /**
     * Calculate reservation summary
     * @private
     */
    _calculateReservationSummary(reservations) {
        const summary = {
            totalReservations: reservations.length,
            confirmed: 0,
            cancelled: 0,
            completed: 0,
            totalGuests: 0,
        };

        reservations.forEach(reservation => {
            summary[reservation.status]++;
            summary.totalGuests += reservation.guests;
        });

        return summary;
    }
}

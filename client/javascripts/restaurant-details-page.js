import { SessionService } from '@services/sessionService.js';
import { bookTable } from '@services/reservationService.js';

import { ReservationCount } from '@components/reservations/reservation-count.js';
import { ReservationButton } from '@components/reservations/reservation-button.js';

import { NotificationSystem } from '@components/notifications/notification-system.js';

import { GuestQuantity } from '@components/restaurants/guest-quantity.js';
import { RelatedRestaurants } from '@components/restaurants/related-restaurants.js';

export class RestaurantApp {
    constructor(restaurantId, restaurantCuisine) {
        this.restaurantId = restaurantId;
        this.restaurantCuisine = restaurantCuisine;
        this.sessionService = new SessionService();
        this.init();
    }

    init() {
        // Initialize session
        const session = this.sessionService.initialize();
        this.sessionId = session.sessionId;

        // Initialize components
        this.reservationCount = new ReservationCount('.reservation-count');
        this.reservationButton = new ReservationButton(
            (result) => this.handleBookingSuccess(result),
            (error) => this.handleBookingError(error)
        );

        this.guestQuantity = new GuestQuantity('guests', 1, 10);
        this.relatedRestaurants = new RelatedRestaurants('related-restaurants-grid');

        // Setup event handlers
        this.setupEventHandlers();

        // Load initial data
        this.loadInitialData();
    }

    setupEventHandlers() {
        // Guest quantity controls
        const quantityBtns = document.querySelectorAll('.quantity-btn[data-quantity-change]');

        quantityBtns.forEach(btn => {
            const delta = parseInt(btn.dataset.quantityChange);
            btn.addEventListener('click', () => this.guestQuantity.changeQuantity(delta));
        });

        // Book table form
        const bookTableForm = document.querySelector('.restaurant-actions');
        if (bookTableForm) {
            bookTableForm.addEventListener('submit', (e) => this.handleBookTable(e));
        }

        // Also handle the direct button click (fallback)
        const bookTableBtn = document.querySelector('.book-table-btn');
        if (bookTableBtn) {
            bookTableBtn.removeAttribute('onclick');
            bookTableBtn.addEventListener('click', (e) => {
                if (e.target.type !== 'submit') {
                    this.handleBookTable(e);
                }
            });
        }
    }

    async loadInitialData() {
        // Load reservation count
        await this.reservationCount.load(this.sessionId);

        // Load related restaurants
        if (this.restaurantCuisine) {
            await this.relatedRestaurants.load(this.restaurantCuisine, this.restaurantId);
        }
    }

    async handleBookTable(e) {
        e.preventDefault();

        const bookBtn = document.querySelector('.book-table-btn');
        const originalContent = bookBtn.innerHTML;
        const guests = this.guestQuantity.getQuantity();

        // Show loading state
        bookBtn.disabled = true;
        bookBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> BOOKING...';

        try {
            await bookTable(this.sessionId, this.restaurantId, guests, {
                onSuccess: (result) => {
                    bookBtn.innerHTML = '✅ BOOKED';
                    this.handleBookingSuccess(result);
                },
                onError: (error) => {
                    bookBtn.innerHTML = '❌ ERROR';
                    this.handleBookingError(error);
                }
            });

        } catch (error) {
            console.error('Error booking table:', error);
            bookBtn.innerHTML = '❌ ERROR';
            this.handleBookingError(error);
        }

        // Reset button state after delay
        setTimeout(() => {
            bookBtn.disabled = false;
            bookBtn.innerHTML = originalContent;
        }, 2000);
    }

    handleBookingSuccess(result) {
        NotificationSystem.success(`✅ ${result.message}`);
        // Reload reservation count after successful booking
        this.reservationCount.load(this.sessionId);
    }

    handleBookingError(error) {
        NotificationSystem.error('❌ Failed to book table. Please try again.');
    }
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    // Extract restaurant info from page
    const restaurantId = document.querySelector('[data-restaurant-id]')?.dataset.restaurantId ||
                        new URLSearchParams(window.location.search).get('restaurantId') ||
                        window.location.pathname.split('/').pop();

    const restaurantCuisine = document.querySelector('[data-restaurant-cuisine]')?.dataset.restaurantCuisine;

    // Initialize the restaurant app
    window.restaurantApp = new RestaurantApp(restaurantId, restaurantCuisine);
});

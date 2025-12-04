export class RelatedRestaurants {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
    }

    async load(cuisine, excludeRestaurantId) {
        if (!this.container) return;

        try {
            const response = await fetch(`/api/restaurants/related?cuisine=${encodeURIComponent(cuisine)}&exclude=${excludeRestaurantId}`);
            
            if (!response.ok) {
                throw new Error('Failed to load related restaurants');
            }

            const restaurants = await response.json();
            this.render(restaurants);

        } catch (error) {
            console.error('Error loading related restaurants:', error);
            this.renderError();
        }
    }

    render(restaurants) {
        if (!restaurants || restaurants.length === 0) {
            this.container.innerHTML = '<p style="text-align: center; color: var(--text);">No related restaurants found.</p>';
            return;
        }

        const restaurantCards = restaurants.map(restaurant => this.createRestaurantCard(restaurant)).join('');
        this.container.innerHTML = restaurantCards;
    }

    createRestaurantCard(restaurant) {
        const emoji = this.getCuisineEmoji(restaurant.cuisine);

        return `
            <div class="restaurant-card" role="listitem">
                <div class="restaurant-image">${emoji}</div>
                <div class="restaurant-info">
                    <h4>${restaurant.name}</h4>
                    <p class="restaurant-cuisine">${restaurant.cuisine} • ⭐ ${restaurant.rating || 'N/A'}</p>
                    <p class="restaurant-price">₹${restaurant.price_for_2 || 'N/A'} for 2
                        <span class="location">${restaurant.locality || restaurant.address || ''}</span>
                    </p>
                    <a href="/restaurants/${restaurant.id}" class="book-btn">VIEW DETAILS</a>
                </div>
            </div>
        `;
    }

    getCuisineEmoji(cuisine) {
        const emojiMap = {
            'North Indian': '🍛',
            'South Indian': '🥘',
            'Chinese': '🥢',
            'Italian': '🍕',
            'Continental': '🍽️',
            'Fast Food': '🍔',
            'Mexican': '🌮',
            'Thai': '🍜',
            'Japanese': '🍱',
            'Mediterranean': '🥙'
        };
        
        return emojiMap[cuisine] || '🍽️';
    }

    renderError() {
        this.container.innerHTML = `
            <div style="text-align: center; padding: 2rem; color: var(--text);">
                <p>Unable to load related restaurants.</p>
                <button onclick="location.reload()" class="book-btn" style="margin-top: 1rem;">
                    TRY AGAIN
                </button>
            </div>
        `;
    }
}

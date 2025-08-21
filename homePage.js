// homePage.js
// This script handles dynamic content for the homepage,
// including the hero product carousel and featured product display.
// It now fetches product data from Firebase via productsData.js.
// Also fetches and displays testimonials from Firebase.

import { getProducts } from './productsData.js'; // Import the new getProducts function (getImagePath no longer needed here)
import { addToCart } from './cartManager.js'; // Import addToCart directly
import { db, auth } from './firebase-config.js'; // Import db and auth for Firestore and Auth operations
import { checkout, showToast } from './uiUpdater.js'; // ADDED: Import functions for checkout

let allProducts = []; // Will store all products fetched from Firestore (unique list)

// DOM Elements - Homepage Specific
const featuredProductsGrid = document.getElementById('featuredProductsGrid');
const featuredCategoryFilter = document.getElementById('featuredCategoryFilter');
const wholesaleProductsGrid = document.getElementById('wholesaleProductsGrid'); // New: Wholesale products grid

/**
 * Renders product cards into a specified grid.
 * This function is a generalized version that can be used for both featured and wholesale products.
 * It uses `product.image` directly, assuming the Firestore `image` field contains the full relative path.
 * @param {Array<Object>} productsToRender - The array of product objects to display.
 * @param {HTMLElement} targetGrid - The DOM element (grid container) where products should be rendered.
 */
function renderProductCards(productsToRender, targetGrid) {
    targetGrid.innerHTML = ''; // Clear existing products
    if (productsToRender.length === 0) {
        targetGrid.innerHTML = `
            <div class="col-span-full text-center py-10 text-gray-500">
                <i class="fas fa-box-open text-5xl mb-4"></i>
                <p class="text-lg">No products found in this category.</p>
            </div>
        `;
        return;
    }

    productsToRender.forEach(product => {
        const productCard = document.createElement('div');
        productCard.classList.add('card', 'animate-fadeIn'); // Use the general 'card' class for consistent styling
        productCard.innerHTML = `
            <div class="product-image-container">
                <img src="${product.image || 'https://placehold.co/400x300/e2e8f0/4a5568?text=No+Img'}"
                     onerror="this.onerror=null;this.src='https://placehold.co/300x225/E0E0E0/333333?text=Image+Not+Found';"
                     alt="${product.name}">
            </div>
            <div class="p-4 flex flex-col flex-grow">
                <h3 class="font-bold text-lg mb-1 text-gray-800">${product.name}</h3>
                <p class="description text-gray-600 text-sm mb-3">${product.unit || 'N/A'}</p>
                <div class="flex items-center justify-between mt-auto">
                    <span class="price text-green-600 font-bold text-xl">KSh ${product.price ? product.price.toLocaleString() : 'N/A'}</span>
                    <button class="add-to-cart-btn bg-green-500 text-white p-2 rounded-full hover:bg-green-600 transition duration-300"
                            data-product-id="${product.id}" data-product-category="${product.category}">
                        <i class="fas fa-plus"></i>
                    </button>
                </div>
            </div>
        `;
        targetGrid.appendChild(productCard);
    });
}

/**
 * Filters and displays featured products based on the selected category.
 * @param {string} category - The category to filter by ('all' for all products).
 */
async function filterFeaturedProducts(category) {
    if (!featuredProductsGrid) {
        console.error("Featured products grid element not found!");
        return;
    }
    featuredProductsGrid.innerHTML = `
        <div class="col-span-full text-center py-10">
            <i class="fas fa-spinner fa-spin text-4xl text-green-600 mb-4"></i>
            <p class="text-gray-500">Loading products...</p>
        </div>
    `; // Show loading spinner

    // Ensure allProducts is populated from the 'all' category of getProducts
    if (allProducts.length === 0) {
        const fetchedProducts = await getProducts();
        allProducts = fetchedProducts.all;
    }

    let productsToDisplay = [];
    if (category === 'all') {
        // Display a random selection of 8 products from all available products
        productsToDisplay = allProducts.sort(() => 0.5 - Math.random()).slice(0, 8);
    } else {
        // Filter by the selected category and display a random selection of up to 8
        const categoryProducts = allProducts.filter(p => p.category === category);
        productsToDisplay = categoryProducts.sort(() => 0.5 - Math.random()).slice(0, 8);
    }

    renderProductCards(productsToDisplay, featuredProductsGrid); // Use the generalized render function
}

/**
 * Displays wholesale products on the homepage.
 */
async function displayWholesaleProducts() {
    if (!wholesaleProductsGrid) {
        console.error("Wholesale products grid element not found!");
        return;
    }
    wholesaleProductsGrid.innerHTML = `
        <div class="col-span-full text-center py-10">
            <i class="fas fa-spinner fa-spin text-4xl text-green-600 mb-4"></i>
            <p class="text-gray-500">Loading wholesale products...</p>
        </div>
    `; // Show loading spinner

    // Ensure allProducts is populated
    if (allProducts.length === 0) {
        const fetchedProducts = await getProducts();
        allProducts = fetchedProducts.all;
    }

    const wholesaleProducts = allProducts.filter(product => product.category === 'wholesale');

    // Display only a limited number of wholesale products (e.g., 8)
    renderProductCards(wholesaleProducts.slice(0, 8), wholesaleProductsGrid); // Use the generalized render function

    if (wholesaleProducts.length === 0) {
        wholesaleProductsGrid.innerHTML = '<p class="col-span-full text-center text-gray-500 py-10">No wholesale products available at the moment.</p>';
    }
}


// --- Testimonial Section ---
const testimonialsGrid = document.getElementById('testimonialsGrid');

/**
 * Fetches testimonials from Firestore and renders them on the homepage.
 */
async function loadTestimonials() {
    if (!testimonialsGrid) {
        console.warn("Testimonials grid element not found.");
        return;
    }

    testimonialsGrid.innerHTML = `
        <div class="col-span-full text-center py-10 swiper-slide">
            <i class="fas fa-spinner fa-spin text-4xl text-green-600 mb-4"></i>
            <p class="text-gray-500">Loading testimonials...</p>
        </div>
    `; // Show loading spinner within a swiper-slide

    try {
        // Access collection and getDocs via firebase.firestore() from the global compat SDK
        const testimonialsCollectionRef = firebase.firestore().collection('testimonials');
        const testimonialSnapshot = await testimonialsCollectionRef.get(); // Use .get() on the collection reference
        const testimonials = [];
        testimonialSnapshot.forEach(doc => {
            testimonials.push({ id: doc.id, ...doc.data() });
        });

        renderTestimonials(testimonials);

    } catch (error) {
        console.error("Error loading testimonials:", error);
        testimonialsGrid.innerHTML = `
            <div class="col-span-full text-center py-10 swiper-slide text-red-500">
                <i class="fas fa-exclamation-circle text-5xl mb-4"></i>
                <p class="text-lg">Failed to load testimonials. Please try again later.</p>
            </div>
        `;
    }
}

/**
 * Renders the fetched testimonials into the testimonials grid.
 * @param {Array<Object>} testimonials - An array of testimonial objects.
 */
function renderTestimonials(testimonials) {
    testimonialsGrid.innerHTML = ''; // Clear existing content

    if (testimonials.length === 0) {
        testimonialsGrid.innerHTML = `
            <div class="col-span-full text-center py-10 swiper-slide text-gray-500">
                <i class="fas fa-comment-alt text-5xl mb-4"></i>
                <p class="text-lg">No testimonials available yet.</p>
            </div>
        `;
        return;
    }

    testimonials.forEach(testimonial => {
        const testimonialDate = testimonial.createdAt ? new Date(testimonial.createdAt.seconds * 1000).toLocaleDateString() : 'N/A';
        const stars = Math.min(5, Math.max(0, Math.round(testimonial.rating || 0)));
        const starIcons = Array(stars).fill('<i class="fas fa-star text-yellow-400 text-xs"></i>').join('') +
                         Array(5 - stars).fill('<i class="far fa-star text-yellow-400 text-xs"></i>').join('');

        const testimonialSlide = document.createElement('div');
        testimonialSlide.classList.add('swiper-slide'); // Add swiper-slide class
        testimonialSlide.innerHTML = `
            <div class="testimonial-card bg-white p-8 rounded-xl shadow-sm h-full">
                <div class="flex items-center mb-4">
                    <div class="flex-shrink-0">
                        <img src="${testimonial.userImage || 'https://randomuser.me/api/portraits/lego/1.jpg'}" alt="${testimonial.userName}" class="w-10 h-10 rounded-full border-2 border-white object-cover">
                    </div>
                    <div class="ml-3">
                        <h4 class="font-bold text-gray-800">${testimonial.userName || 'Anonymous'}</h4>
                        <div class="flex">
                            ${starIcons}
                        </div>
                    </div>
                </div>
                <p class="testimonial-content text-gray-600 italic mb-4">"${testimonial.comment || 'No comment provided.'}"</p>
                <div class="flex items-center text-sm text-gray-500">
                    <i class="fas fa-calendar-alt mr-2"></i>
                    <span>${testimonialDate}</span>
                </div>
            </div>
        `;
        testimonialsGrid.appendChild(testimonialSlide);
    });
}


// --- Event Listeners ---

// Event listener for featured category filter
if (featuredCategoryFilter) {
    featuredCategoryFilter.addEventListener('change', (event) => {
        filterFeaturedProducts(event.target.value);
    });
}

/**
 * Sets up event delegation for 'Add to Cart' buttons within a specific grid.
 * @param {HTMLElement} gridElement - The grid container element.
 */
function setupAddToCartListener(gridElement) {
    if (gridElement) {
        gridElement.addEventListener('click', (event) => {
            const button = event.target.closest('.add-to-cart-btn');
            if (button) {
                const productId = button.dataset.productId;
                if (productId) {
                    addToCart(productId);
                }
            }
        });
    }
}


// --- Initial Load ---
document.addEventListener('DOMContentLoaded', async () => {
    // Fetch all products once on DOMContentLoaded
    const fetchedProducts = await getProducts();
    // Ensure allProducts is populated from the 'all' category of getProducts
    allProducts = fetchedProducts.all;
    // FIX: Store the complete product list on the window object so other scripts can access it.
    window.allProducts = allProducts;


    // Load initial wholesale products
    await displayWholesaleProducts();

    // Load initial featured products (e.g., 'all' category)
    await filterFeaturedProducts('all');

    // Load testimonials
    await loadTestimonials();

    // Setup event listeners after grids are populated
    setupAddToCartListener(featuredProductsGrid);
    setupAddToCartListener(wholesaleProductsGrid);

    // --- ADDED: Event Listener for Checkout Button ---
    const proceedToCheckoutBtn = document.getElementById('proceedToCheckoutBtn');
    if (proceedToCheckoutBtn) {
        proceedToCheckoutBtn.addEventListener('click', () => {
            // Check if user is logged in before proceeding
            if (!auth.currentUser) {
                showToast("Please log in to proceed to checkout.");
                // Optional: Redirect to login after a short delay
                setTimeout(() => {
                    window.location.href = 'login.html';
                }, 1500);
                return;
            }
            // If logged in, call the checkout function
            checkout();
        });
    }
});

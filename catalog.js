// catalog.js
// This script handles dynamic content for the catalog page,
// including product display, category filtering, search, sorting, and pagination.
// UPDATED to handle M-Pesa payment status by polling a Netlify Function instead of Firestore.

import { getProducts } from './productsData.js'; // Correctly import getProducts function
import { showToast, toggleCart, checkout, closeCheckout, showConfirmation, closeConfirmation, updateCartUI, showWaitingModal, hideWaitingModal } from './uiUpdater.js'; // AMENDMENT: Import waiting modal functions
import { addToCart, updateCartItemQuantity, removeFromCart, getCart, clearCart } from './cartManager.js'; // Import cart management functions
import { getCurrentUserWithRole, logout } from './auth.js'; // Import auth functions for user login/logout logic

// Import Firebase modules for database interaction
import { db, auth } from './firebase-config.js'; // Import db and auth instances

// DOM Elements - Catalog Specific
const productGrid = document.getElementById('productGrid');
const categoryTabsContainer = document.querySelector('.flex-wrap.justify-center.gap-3');
const searchInput = document.getElementById('searchInput');
const sortSelect = document.getElementById('sortSelect');
const noResultsMessage = document.getElementById('noResults');
const paginationContainer = document.getElementById('pagination'); // Parent container for pagination buttons
const currentPageSpan = document.getElementById('currentPage'); // Span to display current page number

// DOM Elements - Checkout/Confirmation Modals (can be present on multiple pages)
const checkoutForm = document.getElementById('checkoutForm');
const fullNameInput = document.getElementById('fullName');
const phoneInput = document.getElementById('phone');
const addressInput = document.getElementById('address');
const instructionsInput = document.getElementById('instructions');
const paymentMethodRadios = document.querySelectorAll('input[name="paymentMethod"]');
const mpesaPaymentDiv = document.getElementById('mpesaPayment');
const deliveryPaymentDiv = document.getElementById('deliveryPayment');
const downloadReceiptBtn = document.getElementById('downloadReceiptBtn');
const orderNumberSpan = document.getElementById('orderNumber');
const confirmationMessage = document.getElementById('confirmationMessage');

// DOM Elements - Navigation and User Profile (for mobile sidebar logic)
const loginLink = document.getElementById('loginLink');
const userProfileButton = document.getElementById('userProfileButton');
const userProfilePic = document.getElementById('userProfilePic');
const userInitials = document.getElementById('userInitials');
const userNameDisplay = document.getElementById('userNameDisplay');
const userProfileDropdownContainer = document.getElementById('userProfileDropdownContainer'); // Parent for desktop dropdown
const userDropdownMenu = document.getElementById('userDropdownMenu');
const dropdownUserName = document.getElementById('dropdownUserName');
const dropdownUserEmail = document.getElementById('dropdownUserEmail');
const logoutDropdownButton = document.getElementById('logoutDropdownButton');
const adminLink = document.getElementById('adminLink');

const mobileLoginLink = document.getElementById('mobileLoginLink');
const mobileUserProfileButton = document.getElementById('mobileUserProfileButton');
const mobileUserProfilePic = document.getElementById('mobileUserProfilePic');
const mobileUserInitials = document.getElementById('mobileUserInitials');
const mobileUserNameDisplay = document.getElementById('mobileUserNameDisplay');
const mobileUserDropdownMenu = document.getElementById('mobileUserDropdownMenu');
const mobileDropdownUserName = document.getElementById('mobileDropdownUserName');
const mobileDropdownUserEmail = document.getElementById('mobileDropdownUserEmail');
const mobileLogoutButton = document.getElementById('mobileLogoutButton'); // Corrected ID from 'mobileLogoutDropdownButton'
const mobileAdminLink = document.getElementById('mobileAdminLink');

const mobileMenuButton = document.getElementById('mobileMenuButton');
const mobileMenu = document.getElementById('mobileMenu');
const closeMobileMenuButton = document.getElementById('closeMobileMenuButton');

const PRODUCTS_PER_PAGE = 8; // Number of products to display per page
let allProductsFlat = []; // Flat array of all products for search, sort, and pagination
let currentCategory = 'all'; // Default category
let currentPage = 1; // Current pagination page

// Global variable for app ID, consistent with other modules
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';

/**
 * Renders products into the product grid based on the current filters and pagination.
 * This function will only run if productGrid element exists.
 * @param {Array} productsToDisplay - The array of products to render.
 */
function renderProducts(productsToDisplay) {
    if (!productGrid) {
        return;
    }

    productGrid.innerHTML = ''; // Clear existing products

    if (productsToDisplay.length === 0) {
        if (noResultsMessage) {
            noResultsMessage.classList.remove('hidden');
        }
        return;
    } else {
        if (noResultsMessage) {
            noResultsMessage.classList.add('hidden');
        }
    }

    productsToDisplay.forEach(product => {
        const productCard = document.createElement('div');
        // Use the new product card structure as discussed previously
        productCard.classList.add('product-card'); // Added product-card class for styling
        productCard.innerHTML = `
            <div class="product-card-inner bg-white rounded-lg overflow-hidden shadow-md">
                <div class="product-image-container">
                    <img src="${product.image || 'https://placehold.co/400x300/e2e8f0/4a5568?text=No+Image'}" alt="${product.name}" class="product-image">
                </div>
                <div class="p-4 flex-grow flex flex-col">
                    <h3 class="product-name">${product.name}</h3>
                    <p class="text-gray-600 text-sm mb-2">${product.category}</p>
                    <div class="flex items-center justify-between mt-auto">
                        <span class="product-price">KSh ${product.price.toLocaleString()}</span>
                        <span class="text-gray-500 text-sm">/${product.unit}</span>
                    </div>
                    <button class="add-to-cart-btn mt-4 bg-green-500 text-white py-2 px-4 rounded-md hover:bg-green-600 transition duration-300" data-product-id="${product.id}">
                        Add to Cart
                    </button>
                </div>
            </div>
        `;
        productGrid.appendChild(productCard);
    });

    // Add event listeners to "Add to Cart" buttons
    productGrid.querySelectorAll('.add-to-cart-btn').forEach(button => {
        button.addEventListener('click', (e) => {
            const productId = e.target.dataset.productId;
            addToCart(productId);
        });
    });
}

/**
 * Filters and sorts products based on the current category, search term, and sort order.
 * Applies pagination and renders the products.
 */
async function filterAndRenderProducts() {
    // Only attempt to fetch and render products if productGrid exists (i.e., on catalog.html)
    if (!productGrid) {
        return;
    }

    const allProducts = await getProducts(); // Fetch all products from Firestore
    allProductsFlat = allProducts.all || []; // Get the flat list of all products

    let filteredProducts = allProductsFlat;

    // Category filtering
    if (currentCategory !== 'all') {
        filteredProducts = filteredProducts.filter(product => product.category === currentCategory);
    }

    // Search filtering
    const searchTerm = searchInput ? searchInput.value.toLowerCase() : '';
    if (searchTerm) {
        filteredProducts = filteredProducts.filter(product =>
            product.name.toLowerCase().includes(searchTerm) ||
            product.category.toLowerCase().includes(searchTerm)
        );
    }

    // Sorting
    const sortOrder = sortSelect ? sortSelect.value : 'default';
    if (sortOrder === 'price-asc') {
        filteredProducts.sort((a, b) => a.price - b.price);
    } else if (sortOrder === 'price-desc') {
        filteredProducts.sort((a, b) => b.price - a.price);
    } else if (sortOrder === 'name-asc') {
        filteredProducts.sort((a, b) => a.name.localeCompare(b.name));
    } else if (sortOrder === 'name-desc') {
        filteredProducts.sort((a, b) => b.name.localeCompare(a.name));
    }

    // Pagination
    const totalPages = Math.ceil(filteredProducts.length / PRODUCTS_PER_PAGE);
    // Ensure currentPage doesn't exceed totalPages after filtering/sorting
    if (currentPage > totalPages && totalPages > 0) {
        currentPage = totalPages;
    } else if (totalPages === 0) {
        currentPage = 1; // Reset to 1 if no products
    }

    const startIndex = (currentPage - 1) * PRODUCTS_PER_PAGE;
    const endIndex = startIndex + PRODUCTS_PER_PAGE;
    const productsOnPage = filteredProducts.slice(startIndex, endIndex);

    renderProducts(productsOnPage);
    updatePaginationControls(totalPages);
}

/**
 * Creates a pagination button element.
 * @param {string|number} text - The text content of the button (e.g., '1', '...', 'Previous').
 * @param {number} [pageNumber] - The page number this button represents.
 * @param {string} [action] - The action for the button ('prev', 'next').
 * @param {boolean} [isActive=false] - Whether the button is currently active.
 * @param {boolean} [isDisabled=false] - Whether the button is disabled.
 * @returns {HTMLButtonElement} The created button element.
 */
function createPaginationButton(text, pageNumber, action, isActive = false, isDisabled = false) {
    const button = document.createElement('button');
    button.textContent = text;
    button.classList.add('pagination-btn', 'px-4', 'py-2', 'rounded-md', 'transition', 'duration-200');

    if (action) {
        button.dataset.action = action;
    }
    if (pageNumber) {
        button.dataset.page = pageNumber;
    }

    if (isActive) {
        button.classList.add('bg-green-600', 'text-white', 'hover:bg-green-700');
    } else {
        button.classList.add('bg-gray-200', 'text-gray-700', 'hover:bg-gray-300');
    }

    if (isDisabled) {
        button.classList.add('opacity-50', 'cursor-not-allowed');
        button.disabled = true;
    }

    // Specific styles for page number buttons to make them square
    if (typeof text === 'number' || (typeof text === 'string' && !isNaN(parseInt(text)))) {
        button.classList.add('w-10', 'h-10', 'flex', 'items-center', 'justify-center', 'mx-1');
    }

    return button;
}

/**
 * Updates the pagination controls (page number, prev/next button states).
 * This function will only run if paginationContainer element exists.
 * @param {number} totalPages - The total number of pages.
 */
function updatePaginationControls(totalPages) {
    if (!paginationContainer || !currentPageSpan) {
        return;
    }

    paginationContainer.innerHTML = ''; // Clear existing controls

    if (totalPages <= 1) {
        paginationContainer.classList.add('hidden');
        return;
    } else {
        paginationContainer.classList.remove('hidden');
    }

    // Previous button
    paginationContainer.appendChild(createPaginationButton('Previous', null, 'prev', false, currentPage === 1));

    // Page numbers with ellipsis
    const maxVisiblePages = 5; // Number of page buttons to show (excluding prev/next/ellipses)
    const boundaryPages = 1; // Number of pages to show at the start/end
    
    let pages = [];

    if (totalPages <= maxVisiblePages + 2 * boundaryPages) {
        // Show all pages if total pages are few
        for (let i = 1; i <= totalPages; i++) {
            pages.push(i);
        }
    } else {
        // Always show first page
        pages.push(1);

        // Calculate start and end of the "middle" block of pages
        let startPage = Math.max(2, currentPage - Math.floor(maxVisiblePages / 2));
        let endPage = Math.min(totalPages - 1, currentPage + Math.floor(maxVisiblePages / 2));

        // Adjust start/end to ensure `maxVisiblePages` are shown if near boundaries
        if (currentPage <= boundaryPages + Math.floor(maxVisiblePages / 2)) {
            endPage = maxVisiblePages;
        }
        if (currentPage >= totalPages - boundaryPages - Math.floor(maxVisiblePages / 2)) {
            startPage = totalPages - maxVisiblePages + 1;
        }

        // Add first ellipsis if needed
        if (startPage > 2) {
            pages.push('...');
        }

        // Add middle pages
        for (let i = startPage; i <= endPage; i++) {
            pages.push(i);
        }

        // Add second ellipsis if needed
        if (endPage < totalPages - 1) {
            pages.push('...');
        }

        // Always show last page
        if (!pages.includes(totalPages)) { // Prevent duplicate if totalPages is already in middle block
            pages.push(totalPages);
        }
    }

    pages.forEach(page => {
        if (page === '...') {
            const ellipsisSpan = document.createElement('span');
            ellipsisSpan.textContent = '...';
            ellipsisSpan.classList.add('text-gray-700', 'font-bold', 'mx-1', 'px-2', 'py-2');
            paginationContainer.appendChild(ellipsisSpan);
        } else {
            paginationContainer.appendChild(createPaginationButton(page, page, null, page === currentPage));
        }
    });

    // Next button
    paginationContainer.appendChild(createPaginationButton('Next', null, 'next', false, currentPage === totalPages));

    currentPageSpan.textContent = currentPage; // Update the span for current page
}

/**
 * Handles category tab clicks.
 * This function will only run if categoryTabsContainer element exists.
 * @param {string} category - The category to filter by.
 */
function selectCategory(category) {
    if (!categoryTabsContainer) {
        return;
    }
    currentCategory = category;
    currentPage = 1; // Reset to first page on category change
    filterAndRenderProducts();
    // Update active tab styling
    categoryTabsContainer.querySelectorAll('.category-tab').forEach(tab => {
        if (tab.dataset.category === category) {
            tab.classList.add('bg-green-600', 'text-white', 'active');
            tab.classList.remove('bg-gray-200', 'text-gray-700');
        } else {
            tab.classList.remove('bg-green-600', 'text-white', 'active');
            tab.classList.add('bg-gray-200', 'text-gray-700');
        }
    });
    // Update URL without reloading
    updateUrlParams({ category: category, page: 1 });
}

/**
 * Updates URL query parameters.
 * @param {Object} params - An object of key-value pairs to set in the URL.
 */
function updateUrlParams(params) {
    const url = new URL(window.location);
    for (const key in params) {
        url.searchParams.set(key, params[key]);
    }
    window.history.pushState({}, '', url);
}

/**
 * Reads category and page from URL and applies filters.
 * This function will only attempt to filter and render products if productGrid exists.
 */
async function handleCategoryAndPageFromUrl() {
    const urlParams = new URLSearchParams(window.location.search);
    const categoryFromUrl = urlParams.get('category');
    const pageFromUrl = parseInt(urlParams.get('page')) || 1;

    if (productGrid) {
        if (allProductsFlat.length === 0) {
            try {
                const fetchedProducts = await getProducts();
                allProductsFlat = fetchedProducts.all;
            } catch (error) {
                console.error("Error fetching products for URL params:", error);
                return;
            }
        }

        const availableCategories = new Set(allProductsFlat.map(p => p.category));
        currentCategory = categoryFromUrl && availableCategories.has(categoryFromUrl) ? categoryFromUrl : 'all';
        currentPage = pageFromUrl;

        if (categoryTabsContainer) {
            selectCategory(currentCategory);
        }
        await filterAndRenderProducts();
    }
}


/**
 * Generates and downloads a PDF receipt based on provided order data.
 * @param {Object} orderData - An object containing order details.
 */
window.generateReceipt = function(orderData) {
    const receiptContent = document.createElement('div');
    receiptContent.style.padding = '15px';
    receiptContent.style.fontFamily = '"Roboto Mono", monospace, sans-serif';
    receiptContent.style.fontSize = '9px';
    receiptContent.style.width = '210mm';
    receiptContent.style.height = '297mm';
    receiptContent.style.boxSizing = 'border-box';
    receiptContent.style.color = '#333';

    receiptContent.innerHTML = `
        <div style="text-align: center; margin-bottom: 20px;">
            <img src="IMAGE/LOG.png" alt="Town Treasure Logo" style="height: 100px; margin-bottom: 14px;">
            <h2 style="color: #006d12ff; font-size: 17px; margin-bottom: 3px; font-weight: bold;">Town Treasure Groceries</h2>
            <p style="font-size: 10px; color: #555;">Fresh Market Delivery</p>
        </div>
        <div style="margin-bottom: 15px; border-bottom: 1px dashed #ccc; padding-bottom: 10px;">
            <p style="margin: 3px 0;"><strong>Order Number:</strong> <span style="color: #278a00ff;">${orderData.orderNumber}</span></p>
            <p style="margin: 3px 0;"><strong>Date:</strong> ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
            <p style="margin: 3px 0;"><strong>Customer:</strong> ${orderData.fullName}</p>
            <p style="margin: 3px 0;"><strong>Phone:</strong> ${orderData.phone || 'N/A'}</p>
            <p style="margin: 3px 0;"><strong>Delivery Address:</strong> ${orderData.address}</p>
            ${orderData.instructions ? `<p style="margin: 3px 0;"><strong>Instructions:</strong> ${orderData.instructions}</p>` : ''}
        </div>
        <h3 style="color: #4a6851ff; font-size: 13px; margin-bottom: 10px;">Order Details:</h3>
        <table style="width: 92%; border-collapse: collapse; margin-bottom: 15px; table-layout: fixed;">
            <thead>
                <tr style="background-color: #f0fdf4; border-bottom: 2px solid #06bb00ff;">
                    <th style="padding: 5px; border: 1px solid #eee; text-align: left; width: 10%; font-size: 8px;">Item</th>
                    <th style="padding: 5px; border: 1px solid #eee; text-align: left; width: 10%; font-size: 8px;">Unit</th>
                    <th style="padding: 5px; border: 1px solid #eee; text-align: right; width: 10%; font-size: 8px;">Price</th>
                    <th style="padding: 5px; border: 1px solid #eee; text-align: right; width: 10%; font-size: 8px;">Qty</th>
                    <th style="padding: 5px; border: 1px solid #eee; text-align: right; width: 10%; font-size: 8px;">Total</th>
                </tr>
            </thead>
            <tbody>
                ${orderData.items.map(item => `
                    <tr style="page-break-inside: avoid;">
                        <td style="padding: 5px; border: 1px solid #eee; word-wrap: break-word; font-size: 8px;">${item.name}</td>
                        <td style="padding: 5px; border: 1px solid #eee; font-size: 8px;">${item.unit}</td>
                        <td style="padding: 5px; border: 1px solid #eee; text-align: right; font-size: 8px;">KSh ${item.price.toLocaleString()}</td>
                        <td style="padding: 5px; border: 1px solid #eee; text-align: right; font-size: 8px;">${item.quantity}</td>
                        <td style="padding: 5px; border: 1px solid #eee; text-align: right; font-size: 8px;">KSh ${(item.price * item.quantity).toLocaleString()}</td>
                    </tr>
                `).join('')}
            </tbody>
            <tfoot>
                <tr style="page-break-inside: avoid;">
                    <td colspan="4" style="padding: 5px; border: 1px solid #eee; text-align: right; font-weight: bold; font-size: 9px;">Subtotal:</td>
                    <td style="padding: 5px; border: 1px solid #eee; text-align: right; font-weight: bold; font-size: 9px;">KSh ${orderData.subtotal.toLocaleString()}</td>
                </tr>
                <tr style="page-break-inside: avoid;">
                    <td colspan="4" style="padding: 5px; border: 1px solid #eee; text-align: right; font-weight: bold; font-size: 9px;">Delivery Fee:</td>
                    <td style="padding: 5px; border: 1px solid #eee; text-align: right; font-weight: bold; font-size: 9px;">KSh ${orderData.deliveryFee.toLocaleString()}</td>
                </tr>
                <tr style="background-color: #d1f5d1ff; page-break-inside: avoid;">
                    <td colspan="4" style="padding: 5px; border: 1px solid #eee; text-align: right; font-weight: bold; font-size: 11px;">Grand Total:</td>
                    <td style="padding: 5px; border: 1px solid #eee; text-align: right; font-weight: bold; font-size: 11px;">KSh ${orderData.total.toLocaleString()}</td>
                </tr>
            </tfoot>
        </table>
        <div style="text-align: center; margin-top: 20px; color: #666; font-size: 8px;">
            <p style="margin-bottom: 3px;">Thank you for your purchase from Town Treasure Groceries!</p>
            <p style="margin-bottom: 3px;">We appreciate your business and look forward to serving you again.</p>
            <p style="margin-bottom: 3px;">City Park Market, Limuru Road, Nairobi</p>
            <p>Contact: +254 720 559925 | towntreasuregroceries@gmail.com</p>
        </div>
    `;

    const options = {
        margin: 10,
        filename: `receipt_${orderData.orderNumber}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 1 },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };

    html2pdf().set(options).from(receiptContent).save();
};

/**
 * AMENDMENT: Listens for the creation of the final order document.
 * @param {string} checkoutRequestID - The M-Pesa CheckoutRequestID to look for.
 */
function waitForPaymentConfirmation(checkoutRequestID) {
    const pollUrl = "https://towntreasuregroceries.netlify.app/.netlify/functions/mpesa/getPaymentStatus";
    const POLLING_INTERVAL = 3000; // Poll every 3 seconds
    const TIMEOUT_DURATION = 90000; // 90 seconds timeout

    let pollIntervalId = null;
    let timeoutId = null;

    // Start a timeout to stop polling after a certain duration
    timeoutId = setTimeout(() => {
        clearInterval(pollIntervalId);
        hideWaitingModal();
        showToast("Payment timed out. Please try again or check your M-Pesa account.");
    }, TIMEOUT_DURATION);

    // Start polling the serverless function
    pollIntervalId = setInterval(async () => {
        try {
            const response = await fetch(pollUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ checkoutRequestID }),
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.error || 'Server error during polling.');
            }

            console.log("Polling result:", result);

            // Check the status from the Netlify function response
            if (result.status === 'paid') {
                clearInterval(pollIntervalId);
                clearTimeout(timeoutId);
                hideWaitingModal();
                showToast("Payment successful!");
                showConfirmation(result.finalOrder.orderNumber, result.finalOrder);
                clearCart();
                updateCartUI();
            } else if (result.status === 'failed' || result.status === 'cancelled') {
                clearInterval(pollIntervalId);
                clearTimeout(timeoutId);
                hideWaitingModal();
                showToast(`Payment failed: ${result.message}`);
            }
            // If status is 'pending', the loop continues.

        } catch (error) {
            console.error("Error during polling for payment status:", error);
            clearInterval(pollIntervalId);
            clearTimeout(timeoutId);
            hideWaitingModal();
            showToast("Error checking payment status. Please check your M-Pesa account.");
        }
    }, POLLING_INTERVAL);
}

// --- Event Listeners ---

if (categoryTabsContainer) {
    categoryTabsContainer.addEventListener('click', (event) => {
        const targetTab = event.target.closest('.category-tab');
        if (targetTab) {
            const category = targetTab.dataset.category;
            currentCategory = category;
            currentPage = 1;
            updateUrlParams({ category: currentCategory, page: currentPage });
            selectCategory(currentCategory);
        }
    });
}

if (searchInput) {
    searchInput.addEventListener('input', () => {
        currentPage = 1;
        filterAndRenderProducts();
        updateUrlParams({ search: searchInput.value, page: currentPage, category: currentCategory, sort: sortSelect?.value || '' });
    });
}

if (sortSelect) {
    sortSelect.addEventListener('change', () => {
        currentPage = 1;
        filterAndRenderProducts();
        updateUrlParams({ sort: sortSelect.value, page: currentPage, category: currentCategory, search: searchInput?.value || '' });
    });
}

if (proceedToCheckoutBtn) {
    proceedToCheckoutBtn.addEventListener('click', () => {
        if (!auth.currentUser) {
            showToast("Please log in to proceed to checkout.");
            setTimeout(() => {
                window.location.href = 'login.html';
            }, 1500);
            return;
        }
        checkout();
    });
}

// ========================================================================
// START: MIGRATED CHECKOUT FORM LISTENER
// ========================================================================
if (checkoutForm) {
    checkoutForm.addEventListener('submit', async function(event) {
        event.preventDefault();

        const placeOrderBtn = this.querySelector('button[type="submit"]');
        placeOrderBtn.disabled = true;
        placeOrderBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...';

        if (!auth.currentUser) {
            showToast("You must be logged in to place an order. Redirecting to login...");
            setTimeout(() => { window.location.href = 'login.html'; }, 2000);
            return;
        }

        const customerName = fullNameInput ? fullNameInput.value : '';
        const customerPhone = phoneInput ? phoneInput.value : '';
        const customerAddress = addressInput ? addressInput.value : '';
        const deliveryInstructions = instructionsInput ? instructionsInput.value : '';
        const customerEmail = auth.currentUser.email;
        const selectedPaymentMethod = document.querySelector('input[name="paymentMethod"]:checked').value;

        const tempOrderNum = `TTG-${Date.now().toString().slice(-6)}`;

        const currentCart = getCart();
        let subtotal = 0;
        const productsData = await getProducts();
        const productsMap = {};
        Object.values(productsData).flat().forEach(p => { productsMap[p.id] = p; });

        currentCart.forEach(item => {
            const productDetails = productsMap[item.id];
            subtotal += (productDetails ? productDetails.price : item.price) * item.quantity;
        });

        const DELIVERY_FEE = 0;
        const total = subtotal + DELIVERY_FEE;

        const userId = auth.currentUser.uid;

        const orderDetails = {
            orderNumber: tempOrderNum,
            userId: userId,
            fullName: customerName,
            phone: customerPhone,
            email: customerEmail,
            address: customerAddress,
            instructions: deliveryInstructions,
            items: JSON.parse(JSON.stringify(currentCart)),
            subtotal: subtotal,
            deliveryFee: DELIVERY_FEE,
            total: total,
            paymentMethod: selectedPaymentMethod,
            paymentStatus: 'pending',
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        };
        
        if (selectedPaymentMethod === 'mpesa') {
            try {
                // This logic remains the same as it correctly calls the Netlify function
                const functionUrl = "https://towntreasuregroceries.netlify.app/.netlify/functions/mpesa/initiateMpesaPayment";
                const mpesaResponse = await fetch(functionUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        phone: customerPhone,
                        amount: total,
                        orderDetails: orderDetails
                    }),
                });

                const mpesaResult = await mpesaResponse.json();

                if (!mpesaResponse.ok) {
                    throw new Error(mpesaResult.error || 'M-Pesa API request failed.');
                }
                
                closeCheckout();
                showWaitingModal();
                waitForPaymentConfirmation(mpesaResult.checkoutRequestID);

            } catch (error) {
                console.error("Error during M-Pesa checkout:", error);
                showToast(`Checkout failed: ${error.message}. Please try again.`);
            } finally {
                placeOrderBtn.disabled = false;
                placeOrderBtn.innerHTML = 'Place Order';
            }
        } else if (selectedPaymentMethod === 'delivery') {
            // CHANGE 2: SAVE "PAY ON DELIVERY" TO SUPABASE INSTEAD OF FIREBASE
            try {
                const { data, error } = await supabase
                    .from('unpaid_orders')
                    .insert([{
                        order_number: orderDetails.orderNumber,
                        user_id: orderDetails.userId,
                        full_name: orderDetails.fullName,
                        phone: orderDetails.phone,
                        address: orderDetails.address,
                        items: orderDetails.items,
                        total: orderDetails.total,
                        payment_status: 'unpaid'
                    }]);

                if (error) throw error; // If Supabase returns an error, stop execution
                
                closeCheckout();
                if (confirmationMessage) confirmationMessage.textContent = "Your order has been placed successfully! Please have your payment ready for our delivery rider.";
                showConfirmation(tempOrderNum, orderDetails);
                clearCart();
                updateCartUI();

            } catch(error) {
                console.error("Error placing 'Pay on Delivery' order in Supabase:", error);
                showToast(`Order placement failed: ${error.message}. Please try again.`);
            } finally {
                placeOrderBtn.disabled = false;
                placeOrderBtn.innerHTML = 'Place Order';
            }
        }
    });
}
// ========================================================================
// END: MIGRATED PAYMENT LOGIC
// ========================================================================


if (downloadReceiptBtn) {
    downloadReceiptBtn.addEventListener('click', function() {
        const orderDetailsString = this.dataset.orderDetails;
        if (orderDetailsString) {
            const orderDetails = JSON.parse(orderDetailsString);
            window.generateReceipt(orderDetails);
        } else {
            console.error("No order details found for receipt generation.");
            showToast("Could not generate receipt. Order details missing.");
        }
    });
}

if (paymentMethodRadios) {
    paymentMethodRadios.forEach(radio => {
        radio.addEventListener('change', (event) => {
            mpesaPaymentDiv.classList.add('hidden');
            deliveryPaymentDiv.classList.add('hidden');

            if (event.target.value === 'mpesa') {
                mpesaPaymentDiv.classList.remove('hidden');
            } else if (event.target.value === 'delivery') {
                deliveryPaymentDiv.classList.remove('hidden');
            }
        });
    });
}

if (paginationContainer) {
    paginationContainer.addEventListener('click', (event) => {
        const targetButton = event.target.closest('.pagination-btn');
        if (targetButton && !targetButton.disabled) {
            const action = targetButton.dataset.action;
            const page = parseInt(targetButton.dataset.page);

            if (action === 'prev') {
                currentPage--;
            } else if (action === 'next') {
                currentPage++;
            } else if (!isNaN(page)) {
                currentPage = page;
            }

            filterAndRenderProducts();
            updateUrlParams({ page: currentPage, category: currentCategory, search: searchInput?.value || '', sort: sortSelect?.value || '' });
        }
    });
}

function getInitials(name, email) {
    if (name && name.trim() !== '') {
        const parts = name.trim().split(' ');
        if (parts.length > 1) {
            return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
        }
        return parts[0][0].toUpperCase();
    }
    if (email && email.trim() !== '') {
        return email.trim()[0].toUpperCase();
    }
    return '?';
}

function getFirstName(displayName, email) {
    if (displayName && displayName.trim() !== '') {
        return displayName.trim().split(' ')[0];
    }
    if (email && email.trim() !== '') {
        return email.trim().split('@')[0];
    }
    return 'User';
}

function toggleUserDropdown() {
    if (userDropdownMenu) {
        userDropdownMenu.classList.toggle('hidden');
        userDropdownMenu.classList.toggle('active');
    }
}

function toggleMobileMenu() {
    if (!mobileMenu) return;

    const isActive = mobileMenu.classList.contains('is-active');
    if (isActive) {
        mobileMenu.classList.remove('is-active');
        document.body.classList.remove('overflow-hidden');
    } else {
        mobileMenu.classList.add('is-active');
        document.body.classList.add('overflow-hidden');
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    await handleCategoryAndPageFromUrl();
    updateCartUI();

    const cartSidebar = document.getElementById('cartSidebar');
    if (cartSidebar) {
        cartSidebar.classList.add('translate-x-full');
    }

    const { user, role } = await getCurrentUserWithRole();

    if (user) {
        if (loginLink) loginLink.classList.add('hidden');
        if (userProfileButton) userProfileButton.classList.remove('hidden');

        const firstName = getFirstName(user.displayName, user.email);
        const userFullName = user.displayName || user.email;
        const userEmail = user.email;
        const photoURL = user.photoURL;

        if (userNameDisplay) userNameDisplay.textContent = firstName;
        if (dropdownUserName) dropdownUserName.textContent = userFullName;
        if (dropdownUserEmail) dropdownUserEmail.textContent = userEmail;

        if (photoURL) {
            if (userProfilePic) {
                userProfilePic.src = photoURL;
                userProfilePic.classList.remove('hidden');
            }
            if (userInitials) userInitials.classList.add('hidden');
        } else {
            if (userInitials) {
                userInitials.textContent = getInitials(user.displayName, user.email);
                userInitials.classList.remove('hidden');
            }
            if (userProfilePic) userProfilePic.classList.add('hidden');
        }

        if (userProfileButton) {
            userProfileButton.addEventListener('click', (e) => {
                e.stopPropagation();
                toggleUserDropdown();
            });
        }

        document.addEventListener('click', (e) => {
            if (userProfileDropdownContainer && !userProfileDropdownContainer.contains(e.target)) {
                if (userDropdownMenu && userDropdownMenu.classList.contains('active')) {
                    toggleUserDropdown();
                }
            }
        });

        if (logoutDropdownButton) {
            logoutDropdownButton.addEventListener('click', async (e) => {
                e.preventDefault();
                await logout();
                window.location.reload();
            });
        }

        if (role === 'admin') {
            if (adminLink) adminLink.classList.remove('hidden');
        } else {
            if (adminLink) adminLink.classList.add('hidden');
        }

        if (mobileLoginLink) mobileLoginLink.classList.add('hidden');
        if (mobileLogoutButton) mobileLogoutButton.classList.remove('hidden');

        const mobileDropdownUserName = document.getElementById('mobileDropdownUserName');
        const mobileDropdownUserEmail = document.getElementById('mobileDropdownUserEmail');
        if (mobileDropdownUserName) mobileDropdownUserName.textContent = userFullName;
        if (mobileDropdownUserEmail) mobileDropdownUserEmail.textContent = userEmail;

        if (photoURL) {
            if (mobileUserProfilePic) {
                mobileUserProfilePic.src = photoURL;
                mobileUserProfilePic.classList.remove('hidden');
            }
            if (mobileUserInitials) mobileUserInitials.classList.add('hidden');
        } else {
            if (mobileUserInitials) {
                mobileUserInitials.textContent = getInitials(user.displayName, user.email);
                mobileUserInitials.classList.remove('hidden');
            }
            if (mobileUserProfilePic) mobileUserProfilePic.classList.add('hidden');
        }

        if (mobileLogoutButton) {
            mobileLogoutButton.addEventListener('click', async (e) => {
                e.preventDefault();
                await logout();
                window.location.reload();
            });
        }

        if (role === 'admin') {
            if (mobileAdminLink) mobileAdminLink.classList.remove('hidden');
        } else {
            if (mobileAdminLink) mobileAdminLink.classList.add('hidden');
        }

    } else {
        if (loginLink) loginLink.classList.remove('hidden');
        if (userProfileButton) userProfileButton.classList.add('hidden');
        if (userDropdownMenu) userDropdownMenu.classList.add('hidden');
        if (mobileLoginLink) mobileLoginLink.classList.remove('hidden');
        if (mobileLogoutButton) mobileLogoutButton.classList.add('hidden');
        if (adminLink) adminLink.classList.remove('hidden');
        if (mobileAdminLink) mobileAdminLink.classList.remove('hidden');
    }

    if (mobileMenuButton && mobileMenu && closeMobileMenuButton) {
        mobileMenuButton.addEventListener('click', () => {
            toggleMobileMenu();
        });
        closeMobileMenuButton.addEventListener('click', () => {
            toggleMobileMenu();
        });
        mobileMenu.addEventListener('click', (e) => {
            if (e.target === mobileMenu) {
                toggleMobileMenu();
            }
        });
    } else {
        console.warn("Mobile menu elements not found. Mobile menu toggle may not function.");
    }
});

window.addEventListener('popstate', () => {
    handleCategoryAndPageFromUrl();
});

window.toggleCart = toggleCart;
window.checkout = checkout;
window.closeCheckout = closeCheckout;
window.showConfirmation = showConfirmation;
window.closeConfirmation = closeConfirmation;
window.updateCartItemQuantity = updateCartItemQuantity;
window.removeFromCart = removeFromCart;
window.addToCart = addToCart;
window.clearCart = clearCart;

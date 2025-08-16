// uiUpdater.js
// This file handles all UI updates related to the cart, modals, and toast notifications.
// It no longer handles checkout form submission, which is now in catalog.js.

import { getCart, updateCartItemQuantity, removeFromCart, clearCart } from './cartManager.js';
import { getProducts } from './productsData.js'; // Import getProducts to get full product details for cart display
// Reverting Firebase imports to align with Compat SDK usage in catalog.js
import { db, auth } from './firebase-config.js'; // Import db and auth instances (still needed for some UI elements like authentication status)

// DOM elements (global references for efficiency)
const cartCountSpan = document.getElementById('cartCount');
const mobileCartCountSpan = document.getElementById('mobileCartCount');
const fabCartCountSpan = document.getElementById('fabCartCount');
const mobileBottomCartCountSpan = document.getElementById('mobileBottomCartCount'); // Added for mobile bottom nav cart count
const cartItemsContainer = document.getElementById('cartItems');
const cartSummary = document.getElementById('cartSummary');
const cartSubtotalSpan = document.getElementById('cartSubtotal');
const deliveryFeeSpan = document.getElementById('deliveryFee');
const cartTotalSpan = document.getElementById('cartTotal');
const cartSidebar = document.getElementById('cartSidebar');
const overlay = document.getElementById('overlay');
const checkoutModal = document.getElementById('checkoutModal');
const confirmationModal = document.getElementById('confirmationModal');
const orderNumberSpan = document.getElementById('orderNumber');
const toastElement = document.getElementById('toast');

// Checkout form elements (references remain for UI manipulation, but submission logic is moved)
const paymentMethodRadios = document.querySelectorAll('input[name="paymentMethod"]');
const mpesaPaymentDiv = document.getElementById('mpesaPayment');
const cardPaymentDiv = document.getElementById('cardPayment');
const bankPaymentDiv = document.getElementById('bankPayment');
const downloadReceiptBtn = document.getElementById('downloadReceiptBtn');


const DELIVERY_FEE = 200; // Define your delivery fee

/**
 * Updates the displayed cart count in the navigation and FAB.
 */
function updateCartCounts() {
    const cart = getCart();
    const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);

    if (cartCountSpan) {
        cartCountSpan.textContent = totalItems;
        if (totalItems > 0) {
            cartCountSpan.classList.remove('hidden');
        } else {
            cartCountSpan.classList.add('hidden');
        }
    }
    if (mobileCartCountSpan) {
        mobileCartCountSpan.textContent = totalItems;
        if (totalItems > 0) {
            mobileCartCountSpan.classList.remove('hidden');
        } else {
            mobileCartCountSpan.classList.add('hidden');
        }
    }
    if (fabCartCountSpan) {
        fabCartCountSpan.textContent = totalItems;
        if (totalItems > 0) {
            fabCartCountSpan.classList.remove('hidden');
        } else {
            fabCartCountSpan.classList.add('hidden');
        }
    }
    // Update the mobile bottom nav cart count
    if (mobileBottomCartCountSpan) {
        mobileBottomCartCountSpan.textContent = totalItems;
        if (totalItems > 0) {
            mobileBottomCartCountSpan.classList.add('visible'); // Use 'visible' class for display
        } else {
            mobileBottomCartCountSpan.classList.remove('visible');
        }
    }
}

/**
 * Renders the items currently in the cart into the cart sidebar.
 * It now fetches product details from Firestore to ensure accurate display.
 */
async function renderCartItems() {
    cartItemsContainer.innerHTML = ''; // Clear existing items
    const cart = getCart();

    if (cart.length === 0) {
        cartItemsContainer.innerHTML = `
            <div class="text-center py-10">
                <i class="fas fa-shopping-cart text-4xl text-gray-300 mb-4"></i>
                <p class="text-gray-500">Your cart is empty</p>
                <a href="catalog.html" onclick="window.toggleCart()" class="inline-block mt-4 bg-green-600 hover:bg-green-700 text-white font-medium py-2 px-6 rounded-lg transition duration-300">
                    Start Shopping
                </a>
            </div>
        `;
        if (cartSummary) cartSummary.classList.add('hidden');
        return;
    }

    // Fetch all products from Firestore to get up-to-date details
    const allProducts = await getProducts();
    const productsMap = {};
    for (const category in allProducts) {
        if (Array.isArray(allProducts[category])) { // Ensure it's an array before using find
            allProducts[category].forEach(p => {
                productsMap[p.id] = p;
            });
        }
    }

    let subtotal = 0;

    cart.forEach(item => {
        const productDetails = productsMap[item.id];

        // Use product details from Firestore, fallback to cart item if not found (shouldn't happen)
        const displayImage = productDetails ? productDetails.image : item.image;
        const displayName = productDetails ? productDetails.name : item.name;
        const displayPrice = productDetails ? productDetails.price : item.price;
        const displayUnit = productDetails ? productDetails.unit : item.unit;

        subtotal += displayPrice * item.quantity;

        const cartItemDiv = document.createElement('div');
        cartItemDiv.classList.add('flex', 'items-center', 'space-x-4', 'border-b', 'pb-4', 'mb-4');
        cartItemDiv.innerHTML = `
            <img src="${displayImage || 'https://placehold.co/80x80/e2e8f0/4a5568?text=No+Img'}" alt="${displayName}" class="w-20 h-20 object-cover rounded-lg">
            <div class="flex-grow">
                <h3 class="font-bold text-gray-800">${displayName}</h3>
                <p class="text-gray-600 text-sm">KSh ${displayPrice.toLocaleString()} / ${displayUnit}</p>
                <div class="flex items-center mt-2">
                    <button class="quantity-btn bg-gray-200 text-gray-700 px-2 py-1 rounded-l-md hover:bg-gray-300 transition" data-id="${item.id}" data-action="decrease">-</button>
                    <span class="px-3 py-1 border-t border-b text-gray-800">${item.quantity}</span>
                    <button class="quantity-btn bg-gray-200 text-gray-700 px-2 py-1 rounded-r-md hover:bg-gray-300 transition" data-id="${item.id}" data-action="increase">+</button>
                    <button class="remove-item-btn text-red-500 hover:text-red-700 ml-auto" data-id="${item.id}">
                        <i class="fas fa-trash-alt"></i>
                    </button>
                </div>
            </div>
        `;
        cartItemsContainer.appendChild(cartItemDiv);
    });

    updateCartSummary(subtotal);
    if (cartSummary) cartSummary.classList.remove('hidden');
}

/**
 * Updates the subtotal, delivery fee, and total in the cart summary.
 * @param {number} subtotal - The calculated subtotal of items in the cart.
 */
function updateCartSummary(subtotal) {
    const total = subtotal + DELIVERY_FEE;

    if (cartSubtotalSpan) cartSubtotalSpan.textContent = `KSh ${subtotal.toLocaleString()}`;
    if (deliveryFeeSpan) deliveryFeeSpan.textContent = `KSh ${DELIVERY_FEE.toLocaleString()}`;
    if (cartTotalSpan) cartTotalSpan.textContent = `KSh ${total.toLocaleString()}`;
}

/**
 * The main function to call to update all cart-related UI elements.
 */
async function updateCartUI() {
    updateCartCounts();
    await renderCartItems(); // Await rendering of cart items
}

/**
 * Shows a toast notification with a given message.
 * @param {string} message - The message to display in the toast.
 */
function showToast(message) {
    if (!toastElement) {
        console.warn("Toast element not found.");
        return;
    }
    toastElement.querySelector('span').textContent = message;
    toastElement.classList.remove('hidden');
    toastElement.classList.add('show'); // Use 'show' class for animation

    setTimeout(() => {
        toastElement.classList.remove('show');
        toastElement.classList.add('hidden');
    }, 3000); // Hide after 3 seconds
}

/**
 * Toggles the visibility of the cart sidebar and overlay.
 */
function toggleCart() {
    if (!cartSidebar || !overlay) {
        console.error("Cart sidebar or overlay element not found. Cannot toggle.");
        return;
    }
    const isCartOpen = !cartSidebar.classList.contains('translate-x-full');

    if (isCartOpen) {
        cartSidebar.classList.add('translate-x-full'); // Hide cart
        overlay.classList.add('hidden'); // Hide overlay
        document.body.classList.remove('overflow-hidden'); // Enable body scroll
    } else {
        cartSidebar.classList.remove('translate-x-full'); // Show cart
        overlay.classList.remove('hidden'); // Show overlay
        document.body.classList.add('overflow-hidden'); // Disable body scroll
        updateCartUI(); // Update cart UI when opening
    }
}

/**
 * Shows the checkout modal.
 */
function checkout() {
    if (!checkoutModal || !overlay) {
        console.error("Checkout modal or overlay element not found.");
        return;
    }
    checkoutModal.classList.remove('hidden');
    overlay.classList.remove('hidden');
    document.body.classList.add('overflow-hidden'); // Disable body scroll
    // Ensure cart is hidden when checkout modal is shown
    if (cartSidebar) cartSidebar.classList.add('translate-x-full');
}

/**
 * Closes the checkout modal.
 */
function closeCheckout() {
    if (!checkoutModal || !overlay) {
        console.error("Checkout modal or overlay element not found.");
        return;
    }
    checkoutModal.classList.add('hidden');
    overlay.classList.add('hidden');
    document.body.classList.remove('overflow-hidden'); // Enable body scroll
}

/**
 * Shows the order confirmation modal.
 * @param {string} orderNum - The order number to display.
 */
function showConfirmation(orderNum) {
    if (!confirmationModal || !overlay) {
        console.error("Confirmation modal or overlay element not found.");
        return;
    }
    if (orderNumberSpan) {
        orderNumberSpan.textContent = orderNum;
    }
    confirmationModal.classList.remove('hidden');
    overlay.classList.remove('hidden');
    document.body.classList.add('overflow-hidden'); // Disable body scroll
    clearCart(); // Clear cart after successful order
}

/**
 * Closes the order confirmation modal.
 */
function closeConfirmation() {
    if (!confirmationModal || !overlay) {
        console.error("Confirmation modal or overlay element not found.");
        return;
    }
    confirmationModal.classList.add('hidden');
    overlay.classList.add('hidden');
    document.body.classList.remove('overflow-hidden'); // Enable body scroll
}

// Handle payment method display in checkout modal
if (paymentMethodRadios && mpesaPaymentDiv && cardPaymentDiv && bankPaymentDiv) {
    paymentMethodRadios.forEach(radio => {
        radio.addEventListener('change', (event) => {
            mpesaPaymentDiv.classList.add('hidden');
            cardPaymentDiv.classList.add('hidden');
            bankPaymentDiv.classList.add('hidden');

            if (event.target.value === 'mpesa') {
                mpesaPaymentDiv.classList.remove('hidden');
            } else if (event.target.value === 'card') {
                cardPaymentDiv.classList.remove('hidden');
            } else if (event.target.value === 'bank') {
                bankPaymentDiv.classList.remove('hidden');
            }
        });
    });
}

// Event listener for Download Receipt button
if (downloadReceiptBtn) {
    downloadReceiptBtn.addEventListener('click', () => {
        const element = document.getElementById('confirmationModal'); // Target the confirmation modal content
        const orderNum = orderNumberSpan ? orderNumberSpan.textContent : 'Your_Order';

        html2pdf(element, {
            margin: 1,
            filename: `receipt_${orderNum}.pdf`,
            image: { type: 'jpeg', quality: 0.98 },
            html2canvas: { scale: 2, logging: true, dpi: 192, letterRendering: true },
            jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' }
        });
    });
}


// Export functions for modular use
export { updateCartUI, showToast, toggleCart, checkout, closeCheckout, showConfirmation, closeConfirmation };

// Event delegation for cart item actions
// This ensures that event listeners work for items added dynamically to the cart.
if (cartItemsContainer) {
    cartItemsContainer.addEventListener('click', (event) => {
        const target = event.target;
        
        // Handle quantity buttons
        if (target.classList.contains('quantity-btn')) {
            const productId = target.dataset.id;
            const action = target.dataset.action;
            updateCartItemQuantity(productId, action === 'increase' ? 1 : -1);
        } 
        // Handle remove buttons
        else if (target.closest('.remove-item-btn')) {
            const button = target.closest('.remove-item-btn');
            const productId = button.dataset.id;
            removeFromCart(productId);
        }
    });
}


// uiUpdater.js
// This file handles all UI updates related to the cart, modals, and toast notifications.
// Event listeners have been moved to catalog.js to centralize page logic.

import { getCart } from './cartManager.js';
import { getProducts } from './productsData.js';

// DOM elements (global references for efficiency)
const cartCountSpan = document.getElementById('cartCount');
const mobileCartCountSpan = document.getElementById('mobileCartCount');
const fabCartCountSpan = document.getElementById('fabCartCount');
const mobileBottomCartCountSpan = document.getElementById('mobileBottomCartCount');
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
const waitingModal = document.getElementById('waitingModal');
const downloadReceiptBtn = document.getElementById('downloadReceiptBtn');

const DELIVERY_FEE = 0;

/**
 * Updates the displayed cart count in the navigation and FAB.
 */
function updateCartCounts() {
    const cart = getCart();
    const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);

    const elements = [cartCountSpan, mobileCartCountSpan, fabCartCountSpan, mobileBottomCartCountSpan];
    elements.forEach(el => {
        if (el) {
            el.textContent = totalItems;
            if (totalItems > 0) {
                // Use a consistent class for visibility
                el.classList.add('visible');
                el.classList.remove('hidden');
            } else {
                el.classList.remove('visible');
                el.classList.add('hidden');
            }
        }
    });
}

/**
 * Renders the items currently in the cart into the cart sidebar.
 */
async function renderCartItems() {
    if (!cartItemsContainer) return;
    cartItemsContainer.innerHTML = '';
    const cart = getCart();

    if (cart.length === 0) {
        cartItemsContainer.innerHTML = `
            <div class="text-center py-10">
                <i class="fas fa-shopping-cart text-4xl text-gray-300 mb-4"></i>
                <p class="text-gray-500">Your cart is empty</p>
                <a href="catalog.html" class="inline-block mt-4 bg-green-600 hover:bg-green-700 text-white font-medium py-2 px-6 rounded-lg transition duration-300">
                    Start Shopping
                </a>
            </div>
        `;
        if (cartSummary) cartSummary.classList.add('hidden');
        return;
    }

    const allProducts = await getProducts();
    const productsMap = {};
    Object.values(allProducts).flat().forEach(p => {
        if(p && p.id) productsMap[p.id] = p;
    });


    let subtotal = 0;

    cart.forEach(item => {
        const productDetails = productsMap[item.id];
        const displayImage = productDetails?.image || item.image || 'https://placehold.co/80x80/e2e8f0/4a5568?text=No+Img';
        const displayName = productDetails?.name || item.name;
        const displayPrice = productDetails?.price || item.price;
        const displayUnit = productDetails?.unit || item.unit;

        subtotal += displayPrice * item.quantity;

        const cartItemDiv = document.createElement('div');
        cartItemDiv.classList.add('flex', 'items-center', 'space-x-4', 'border-b', 'pb-4', 'mb-4');
        cartItemDiv.innerHTML = `
            <img src="${displayImage}" alt="${displayName}" class="w-20 h-20 object-cover rounded-lg">
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
    await renderCartItems();
}

/**
 * Shows a toast notification with a given message.
 */
function showToast(message) {
    if (!toastElement) return;
    toastElement.querySelector('span').textContent = message;
    toastElement.classList.remove('hidden', 'translate-y-20');
    toastElement.classList.add('show');

    setTimeout(() => {
        toastElement.classList.remove('show');
        toastElement.classList.add('hidden', 'translate-y-20');
    }, 3000);
}

/**
 * Toggles the visibility of the cart sidebar and overlay.
 */
function toggleCart() {
    if (!cartSidebar || !overlay) return;
    const isCartOpen = !cartSidebar.classList.contains('translate-x-full');
    if (isCartOpen) {
        cartSidebar.classList.add('translate-x-full');
        overlay.classList.add('hidden');
        document.body.classList.remove('overflow-hidden');
    } else {
        cartSidebar.classList.remove('translate-x-full');
        overlay.classList.remove('hidden');
        document.body.classList.add('overflow-hidden');
        updateCartUI();
    }
}

/**
 * Shows the checkout modal.
 */
function checkout() {
    if (!checkoutModal || !overlay) return;
    checkoutModal.classList.remove('hidden');
    overlay.classList.remove('hidden');
    document.body.classList.add('overflow-hidden');
    if (cartSidebar) cartSidebar.classList.add('translate-x-full');
}

/**
 * Closes the checkout modal.
 */
function closeCheckout() {
    if (!checkoutModal || !overlay) return;
    checkoutModal.classList.add('hidden');
    overlay.classList.add('hidden');
    document.body.classList.remove('overflow-hidden');
}

/**
 * Shows the order confirmation modal and prepares receipt data.
 */
function showConfirmation(orderNum, fullOrderData = {}) {
    if (!confirmationModal || !overlay) return;
    if (orderNumberSpan) {
        orderNumberSpan.textContent = orderNum;
    }
    if (downloadReceiptBtn) {
        downloadReceiptBtn.dataset.orderDetails = JSON.stringify(fullOrderData);
    }
    confirmationModal.classList.remove('hidden');
    overlay.classList.remove('hidden');
    document.body.classList.add('overflow-hidden');
}

/**
 * Closes the order confirmation modal.
 */
function closeConfirmation() {
    if (!confirmationModal || !overlay) return;
    confirmationModal.classList.add('hidden');
    overlay.classList.add('hidden');
    document.body.classList.remove('overflow-hidden');
}

/**
 * Shows the waiting for payment modal.
 */
function showWaitingModal() {
    if (!waitingModal || !overlay) return;
    waitingModal.classList.remove('hidden');
    overlay.classList.remove('hidden');
    document.body.classList.add('overflow-hidden');
}

/**
 * Hides the waiting for payment modal.
 */
function hideWaitingModal() {
    if (!waitingModal || !overlay) return;
    waitingModal.classList.add('hidden');
    // Don't hide overlay if another modal (like confirmation) will appear
    const isConfirmationVisible = confirmationModal && !confirmationModal.classList.contains('hidden');
    if (!isConfirmationVisible) {
        overlay.classList.add('hidden');
        document.body.classList.remove('overflow-hidden');
    }
}

// Export functions for modular use
export { updateCartUI, showToast, toggleCart, checkout, closeCheckout, showConfirmation, closeConfirmation, showWaitingModal, hideWaitingModal };

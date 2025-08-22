// uiUpdater.js
// Handles all UI updates related to the cart, modals, and toast notifications.

import { getCart } from './cartManager.js';
import { getProducts } from './productsData.js';
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

// --- Supabase Setup ---
const supabaseUrl = 'https://toviekzgoxwumanyxkvv.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRvdmlla3pnb3h3dW1hbnl4a3Z2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTU1MzIxNzUsImV4cCI6MjA3MTEwODE3NX0.eDgM2Bu7UsL3YMdFqVNruNCyiJvqsao44Noba1LfjdY';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

// --- DOM Elements ---
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

// --- Cart Counts ---
function updateCartCounts() {
    const cart = getCart();
    const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);

    const elements = [cartCountSpan, mobileCartCountSpan, fabCartCountSpan, mobileBottomCartCountSpan];
    elements.forEach(el => {
        if (el) {
            el.textContent = totalItems;
            if (totalItems > 0) {
                el.classList.add('visible');
                el.classList.remove('hidden');
            } else {
                el.classList.remove('visible');
                el.classList.add('hidden');
            }
        }
    });
}

// --- Render Cart Items ---
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
        if (p && p.id) productsMap[p.id] = p;
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

// --- Update Cart Summary ---
function updateCartSummary(subtotal) {
    const total = subtotal + DELIVERY_FEE;
    if (cartSubtotalSpan) cartSubtotalSpan.textContent = `KSh ${subtotal.toLocaleString()}`;
    if (deliveryFeeSpan) deliveryFeeSpan.textContent = `KSh ${DELIVERY_FEE.toLocaleString()}`;
    if (cartTotalSpan) cartTotalSpan.textContent = `KSh ${total.toLocaleString()}`;
}

// --- Update Cart UI ---
async function updateCartUI() {
    updateCartCounts();
    await renderCartItems();
}

// --- Toast Notifications ---
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

// --- Cart Sidebar Toggle ---
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

// --- Checkout Modal ---
function checkout() {
    if (!checkoutModal || !overlay) return;
    checkoutModal.classList.remove('hidden');
    overlay.classList.remove('hidden');
    document.body.classList.add('overflow-hidden');
    if (cartSidebar) cartSidebar.classList.add('translate-x-full');
}
function closeCheckout() {
    if (!checkoutModal || !overlay) return;
    checkoutModal.classList.add('hidden');
    overlay.classList.add('hidden');
    document.body.classList.remove('overflow-hidden');
}

// --- Confirmation Modal (PAID + UNPAID orders) ---
async function showConfirmation(orderNum, fullOrderData = {}) {
    if (!confirmationModal || !overlay) return;
    if (orderNumberSpan) {
        orderNumberSpan.textContent = orderNum;
    }

    if (downloadReceiptBtn) {
        // --- Case 1: Paid orders (already in Supabase paid_orders) ---
        if (fullOrderData.id && fullOrderData.payment_status === 'paid') {
            downloadReceiptBtn.dataset.orderId = fullOrderData.id;
            delete downloadReceiptBtn.dataset.orderDetails;
            downloadReceiptBtn.classList.remove('hidden');
        } 
        // --- Case 2: Unpaid "Pay on Delivery" orders (fetch from Supabase unpaid_orders) ---
        else {
            let unpaidOrder = null;

            if (fullOrderData.id && fullOrderData.paymentMethod === 'delivery') {
                const { data, error } = await supabase
                    .from('unpaid_orders')
                    .select('*')
                    .eq('id', fullOrderData.id)
                    .single();
                if (!error) unpaidOrder = data;
            }

            if (!unpaidOrder && orderNum) {
                const { data, error } = await supabase
                    .from('unpaid_orders')
                    .select('*')
                    .eq('order_number', orderNum)
                    .single();
                if (!error) unpaidOrder = data;
            }

            if (unpaidOrder) {
                downloadReceiptBtn.dataset.orderDetails = JSON.stringify(unpaidOrder);
                delete downloadReceiptBtn.dataset.orderId;
                downloadReceiptBtn.classList.remove('hidden');
            } else {
                downloadReceiptBtn.classList.add('hidden');
            }
        }
    }

    confirmationModal.classList.remove('hidden');
    overlay.classList.remove('hidden');
    document.body.classList.add('overflow-hidden');
}

function closeConfirmation() {
    if (!confirmationModal || !overlay) return;
    confirmationModal.classList.add('hidden');
    overlay.classList.add('hidden');
    document.body.classList.remove('overflow-hidden');
}

// --- Waiting Modal ---
function showWaitingModal() {
    if (!waitingModal || !overlay) return;
    waitingModal.classList.remove('hidden');
    overlay.classList.remove('hidden');
    document.body.classList.add('overflow-hidden');
}
function hideWaitingModal() {
    if (!waitingModal || !overlay) return;
    waitingModal.classList.add('hidden');
    const isConfirmationVisible = confirmationModal && !confirmationModal.classList.contains('hidden');
    if (!isConfirmationVisible) {
        overlay.classList.add('hidden');
        document.body.classList.remove('overflow-hidden');
    }
}

// --- Exports ---
export { 
    updateCartUI, showToast, toggleCart, checkout, closeCheckout, 
    showConfirmation, closeConfirmation, showWaitingModal, hideWaitingModal 
};

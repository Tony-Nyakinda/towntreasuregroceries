// eventListeners.js
// This file sets up all general event listeners for the page,
// including the checkout form, payment logic, and receipt generation.

import {
    updateCartUI,
    showToast,
    toggleCart,
    checkout,
    closeCheckout,
    showConfirmation,
    closeConfirmation,
    showWaitingModal,
    hideWaitingModal
} from './uiUpdater.js';
import { auth } from './firebase-config.js';
import { supabase } from './supabase-config.js';
import { getProducts } from './productsData.js';
import { getCart, clearCart } from './cartManager.js';

/**
 * Polls a serverless function to check the status of an M-Pesa payment.
 * @param {string} checkoutRequestID - The M-Pesa CheckoutRequestID to track.
 */
function waitForPaymentConfirmation(checkoutRequestID) {
    const pollUrl = "https://towntreasuregroceries.netlify.app/.netlify/functions/mpesa/getPaymentStatus";
    const POLLING_INTERVAL = 3000; // Poll every 3 seconds
    const TIMEOUT_DURATION = 90000; // 90 seconds timeout

    let pollIntervalId = null;
    let timeoutId = null;

    showWaitingModal();

    timeoutId = setTimeout(() => {
        clearInterval(pollIntervalId);
        hideWaitingModal();
        showToast("Payment timed out. Please try again or check your M-Pesa account.");
    }, TIMEOUT_DURATION);

    pollIntervalId = setInterval(async () => {
        try {
            const response = await fetch(pollUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ checkoutRequestID }),
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error || 'Server error during polling.');

            if (result.status === 'paid') {
                clearInterval(pollIntervalId);
                clearTimeout(timeoutId);
                hideWaitingModal();
                showToast("Payment successful!");
                showConfirmation(result.finalOrder.order_number, result.finalOrder);
                clearCart();
                updateCartUI();
            } else if (result.status === 'failed' || result.status === 'cancelled') {
                clearInterval(pollIntervalId);
                clearTimeout(timeoutId);
                hideWaitingModal();
                showToast(`Payment failed: ${result.message}`);
            }
        } catch (error) {
            console.error("Error during polling for payment status:", error);
            clearInterval(pollIntervalId);
            clearTimeout(timeoutId);
            hideWaitingModal();
            showToast("Error checking payment status. Please check your M-Pesa account.");
        }
    }, POLLING_INTERVAL);
}


document.addEventListener('DOMContentLoaded', () => {
    // --- General UI Elements ---
    const contactForm = document.getElementById('contactForm');
    const overlay = document.getElementById('overlay');
    const loginLink = document.getElementById('loginLink');
    const mobileLoginLink = document.getElementById('mobileLoginLink');
    
    // --- Cart & Modal Buttons ---
    const mainCartButton = document.getElementById('mainCartButton');
    const fabCartButton = document.getElementById('fabCartButton');
    const closeCartButton = document.getElementById('closeCartButton');
    const mobileBottomCartButton = document.getElementById('mobileBottomCartButton');
    const startShoppingLink = document.getElementById('startShoppingLink');
    const closeCheckoutButton = document.getElementById('closeCheckoutButton');
    const continueShoppingButton = document.getElementById('continueShoppingButton');
    const downloadReceiptBtn = document.getElementById('downloadReceiptBtn');

    // --- Checkout Form Elements ---
    const checkoutForm = document.getElementById('checkoutForm');
    const fullNameInput = document.getElementById('fullName');
    const phoneInput = document.getElementById('phone');
    const addressInput = document.getElementById('address');
    const instructionsInput = document.getElementById('instructions');
    const confirmationMessage = document.getElementById('confirmationMessage');

    // --- Cart Button Listeners ---
    if (mainCartButton) mainCartButton.addEventListener('click', toggleCart);
    if (fabCartButton) fabCartButton.addEventListener('click', toggleCart);
    if (closeCartButton) closeCartButton.addEventListener('click', toggleCart);
    if (startShoppingLink) startShoppingLink.addEventListener('click', toggleCart);
    if (mobileBottomCartButton) {
        mobileBottomCartButton.addEventListener('click', (e) => {
            e.preventDefault();
            toggleCart();
        });
    }

    // --- Modal Button Listeners ---
    if (closeCheckoutButton) closeCheckoutButton.addEventListener('click', closeCheckout);
    if (continueShoppingButton) continueShoppingButton.addEventListener('click', closeConfirmation);

    // --- *** FIX #1: REPLACED DOWNLOAD BUTTON LISTENER *** ---
    // This listener now correctly handles both paid and unpaid orders
    // by checking for 'data-order-details' (for unpaid) and 'data-order-id' (for paid).
    if (downloadReceiptBtn) {
        downloadReceiptBtn.addEventListener('click', async () => {
            const paidOrderId = downloadReceiptBtn.dataset.orderId;
            const unpaidOrderDetailsString = downloadReceiptBtn.dataset.orderDetails;
            
            let payload = {};

            // Case 1: Handle unpaid orders from 'data-order-details'
            if (unpaidOrderDetailsString) {
                try {
                    const orderDetails = JSON.parse(unpaidOrderDetailsString);
                    payload = {
                        orderId: orderDetails.id, // Extract the database ID from the JSON object
                        source: 'unpaid'
                    };
                } catch (e) {
                    console.error("Failed to parse order details:", e);
                    showToast("Error preparing receipt data.");
                    return;
                }
            } 
            // Case 2: Handle paid orders from 'data-order-id'
            else if (paidOrderId) {
                payload = {
                    orderId: paidOrderId,
                    source: 'paid'
                };
            } 
            // Case 3: No ID found
            else {
                console.error("No order ID or details found on the button.");
                showToast("Could not find order to generate receipt.");
                return;
            }

            const originalText = downloadReceiptBtn.innerHTML;
            downloadReceiptBtn.disabled = true;
            downloadReceiptBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Generating...';

            try {
                const response = await fetch('/.netlify/functions/generate-receipt', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });

                if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(errorData.error || 'Failed to generate receipt.');
                }

                const blob = await response.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.style.display = 'none';
                a.href = url;
                
                const disposition = response.headers.get('content-disposition');
                let filename = 'receipt.pdf';
                if (disposition && disposition.includes('attachment')) {
                    const filenameRegex = /filename="([^"]+)"/;
                    const matches = filenameRegex.exec(disposition);
                    if (matches != null && matches[1]) {
                        filename = matches[1];
                    }
                }
                a.download = filename;
                document.body.appendChild(a);
                a.click();
                window.URL.revokeObjectURL(url);
                a.remove();

            } catch (error) {
                console.error('Download error:', error);
                showToast(`Error: ${error.message}`);
            } finally {
                downloadReceiptBtn.disabled = false;
                downloadReceiptBtn.innerHTML = originalText;
            }
        });
    }

    // --- Overlay Listener ---
    if (overlay) {
        overlay.addEventListener('click', () => {
            const cartSidebar = document.getElementById('cartSidebar');
            const checkoutModal = document.getElementById('checkoutModal');
            const confirmationModal = document.getElementById('confirmationModal');

            if (cartSidebar && !cartSidebar.classList.contains('translate-x-full')) toggleCart();
            if (checkoutModal && !checkoutModal.classList.contains('hidden')) closeCheckout();
            if (confirmationModal && !confirmationModal.classList.contains('hidden')) closeConfirmation();
        });
    }

    // --- Contact Form Submission ---
    if (contactForm) {
        contactForm.addEventListener('submit', function(event) {
            event.preventDefault();
            showToast('Message sent successfully!');
            contactForm.reset();
        });
    }

    // --- Login/Logout Link Logic (No changes here) ---
    if (loginLink) {
        loginLink.addEventListener('click', async (e) => {
            if (loginLink.textContent === 'Logout') {
                e.preventDefault();
                try {
                    await auth.signOut();
                    window.location.reload();
                } catch (error) {
                    console.error("Error logging out:", error);
                    showToast('Error logging out. Please try again.');
                }
            }
        });
    }

    if (mobileLoginLink) {
        mobileLoginLink.addEventListener('click', async (e) => {
            if (mobileLoginLink.textContent === 'Logout') {
                e.preventDefault();
                try {
                    await auth.signOut();
                    window.location.reload();
                } catch (error) {
                    console.error("Error logging out (mobile):", error);
                    showToast('Error logging out. Please try again.');
                }
            }
        });
    }

    // --- Main Checkout Form Submission Listener ---
    if (checkoutForm) {
        checkoutForm.addEventListener('submit', async function(event) {
            event.preventDefault();

            const placeOrderBtn = this.querySelector('button[type="submit"]');
            placeOrderBtn.disabled = true;
            placeOrderBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...';

            if (!auth.currentUser) {
                showToast("You must be logged in to place an order.");
                setTimeout(() => { window.location.href = 'login.html'; }, 2000);
                placeOrderBtn.disabled = false;
                placeOrderBtn.innerHTML = 'Place Order';
                return;
            }

            try {
                const customerName = fullNameInput ? fullNameInput.value : '';
                const customerPhone = phoneInput ? phoneInput.value : '';
                const customerAddress = addressInput ? addressInput.value : '';
                const deliveryInstructions = instructionsInput ? instructionsInput.value : '';
                const selectedPaymentMethod = document.querySelector('input[name="paymentMethod"]:checked').value;
                const tempOrderNum = `TTG-${Date.now().toString().slice(-6)}`;

                const currentCart = getCart();
                const productsData = await getProducts();
                const allProds = Array.isArray(productsData.all) ? productsData.all : [];

                if (allProds.length === 0) {
                    throw new Error("Could not fetch product data for checkout. Please try again.");
                }

                const productsMap = {};
                allProds.forEach(p => { productsMap[p.id] = p; });

                const enrichedCartItems = currentCart.map(item => {
                    const productDetails = productsMap[item.id];
                    if (!productDetails) {
                        console.error(`Product with ID ${item.id} not found in product list.`);
                        return { ...item, name: 'Unknown Product', price: 0, unit: '' };
                    }
                    return {
                        ...item,
                        name: productDetails.name,
                        price: productDetails.price,
                        unit: productDetails.unit
                    };
                });

                const subtotal = enrichedCartItems.reduce((acc, item) => acc + (item.price * item.quantity), 0);
                const total = subtotal;
                const userId = auth.currentUser.uid;

                const orderDetails = {
                    orderNumber: tempOrderNum,
                    userId: userId,
                    fullName: customerName,
                    phone: customerPhone,
                    address: customerAddress,
                    instructions: deliveryInstructions,
                    items: enrichedCartItems,
                    total: total,
                    paymentMethod: selectedPaymentMethod,
                };

                if (selectedPaymentMethod === 'mpesa') {
                    const functionUrl = "https://towntreasuregroceries.netlify.app/.netlify/functions/mpesa/initiateMpesaPayment";
                    const mpesaResponse = await fetch(functionUrl, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ phone: customerPhone, amount: total, orderDetails }),
                    });
                    const mpesaResult = await mpesaResponse.json();
                    if (!mpesaResponse.ok) throw new Error(mpesaResult.error || 'M-Pesa API request failed.');

                    closeCheckout();
                    waitForPaymentConfirmation(mpesaResult.checkoutRequestID);

                } else if (selectedPaymentMethod === 'delivery') {
                    // --- *** FIX #2: MODIFIED PAY-ON-DELIVERY LOGIC *** ---
                    // Added .select().single() to get the created order object back from Supabase.
                    // This ensures we have the correct database ID (`unpaidOrder.id`) to pass to the confirmation modal.
                    const { data: unpaidOrder, error } = await supabase.from('unpaid_orders').insert([{
                        order_number: orderDetails.orderNumber,
                        user_id: orderDetails.userId,
                        full_name: orderDetails.fullName,
                        phone: orderDetails.phone,
                        address: orderDetails.address,
                        instructions: orderDetails.instructions,
                        items: orderDetails.items,
                        total: orderDetails.total,
                        payment_status: 'unpaid',
                        payment_method: 'delivery'
                    }]).select().single();

                    if (error) throw error;

                    closeCheckout();
                    if (confirmationMessage) confirmationMessage.textContent = "Your order has been placed successfully! Please have your payment ready for our delivery rider.";
                    
                    // Now we pass the full order object from the database to the confirmation UI.
                    showConfirmation(unpaidOrder.order_number, unpaidOrder);
                    clearCart();
                    updateCartUI();
                }
            } catch (error) {
                console.error("Error during checkout:", error);
                showToast(`Checkout failed: ${error.message}. Please try again.`);
            } finally {
                placeOrderBtn.disabled = false;
                placeOrderBtn.innerHTML = 'Place Order';
            }
        });
    }

    // --- Initial UI Update ---
    updateCartUI();
});

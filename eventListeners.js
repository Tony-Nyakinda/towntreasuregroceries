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
    hideWaitingModal,
    showAlertModal
} from './uiUpdater.js';
import { auth, db } from './firebase-config.js';
import { supabase } from './supabase-config.js';
import { getProducts } from './productsData.js';
import { getCart, clearCart } from './cartManager.js';
import { getDeliveryFee } from './delivery-zones.js';

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
        showAlertModal("Payment timed out. Please try again or check your M-Pesa account.", "Payment Timeout", "error");
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
                showAlertModal(`Your payment was not completed: ${result.message}. Please try again.`, "Payment Unsuccessful", "error");
            }
        } catch (error) {
            console.error("Error during polling for payment status:", error);
            clearInterval(pollIntervalId);
            clearTimeout(timeoutId);
            hideWaitingModal();
            showAlertModal("An error occurred while checking the payment status. Please check your M-Pesa account for confirmation.", "Error", "error");
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

    // --- Download Receipt Button Listener ---
    if (downloadReceiptBtn) {
        downloadReceiptBtn.addEventListener('click', async () => {
            const paidOrderId = downloadReceiptBtn.dataset.orderId;
            const unpaidOrderDetailsString = downloadReceiptBtn.dataset.orderDetails;
            
            let payload = {};

            if (unpaidOrderDetailsString) {
                try {
                    const orderDetails = JSON.parse(unpaidOrderDetailsString);
                    payload = { orderId: orderDetails.id, source: 'unpaid' };
                } catch (e) {
                    console.error("Failed to parse order details:", e);
                    showToast("Error preparing receipt data.");
                    return;
                }
            } 
            else if (paidOrderId) {
                payload = { orderId: paidOrderId, source: 'paid' };
            } 
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

    // --- Contact Form Submission Logic ---
    if (contactForm) {
        contactForm.addEventListener('submit', async function(event) {
            event.preventDefault();
            
            const submitButton = contactForm.querySelector('button[type="submit"]');
            const originalButtonText = submitButton.innerHTML;
            submitButton.disabled = true;
            submitButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sending...';

            try {
                const name = document.getElementById('name').value;
                const email = document.getElementById('email').value;
                const subject = document.getElementById('subject').value;
                const message = document.getElementById('message').value;
                const userId = auth.currentUser ? auth.currentUser.uid : null;

                await db.collection('messages').add({
                    name,
                    email,
                    subject,
                    message,
                    userId,
                    createdAt: firebase.firestore.FieldValue.serverTimestamp()
                });

                showToast('Message sent successfully!');
                contactForm.reset();

            } catch (error) {
                console.error("Error sending message:", error);
                showAlertModal('Failed to send message. Please try again.', 'Error', 'error');
            } finally {
                submitButton.disabled = false;
                submitButton.innerHTML = originalButtonText;
            }
        });
    }

    // --- Login/Logout Link Logic ---
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
                const deliveryFee = getDeliveryFee(customerAddress);
                const total = subtotal + deliveryFee;
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
                    deliveryFee: deliveryFee 
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
                        payment_method: 'delivery',
                        delivery_fee: orderDetails.deliveryFee
                    }]).select().single();

                    if (error) {
                        // This will now provide a more detailed error in the console
                        console.error("Supabase insert error:", error);
                        throw error;
                    }

                    closeCheckout();
                    if (confirmationMessage) confirmationMessage.textContent = "Your order has been placed successfully! Please have your payment ready for our delivery rider.";
                    
                    showConfirmation(unpaidOrder.order_number, unpaidOrder);
                    clearCart();
                    updateCartUI();
                }
            } catch (error) {
                // AMENDED: More detailed error logging
                console.error("Full checkout error object:", error);
                const errorMessage = error.message || 'An unknown error occurred.';
                showAlertModal(`Checkout failed: ${errorMessage}. Please check the console for more details.`, "Checkout Error", "error");
            } finally {
                // This 'finally' block ensures the button is always reset,
                // whether the process succeeds or fails.
                placeOrderBtn.disabled = false;
                placeOrderBtn.innerHTML = 'Place Order';
            }
        });
    }

    // --- Initial UI Update ---
    updateCartUI();
});

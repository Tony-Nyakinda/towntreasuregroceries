// checkout.js
// This script handles all logic for the dedicated checkout page.

import { auth } from './firebase-config.js';
import { supabase } from './supabase-config.js';
import { getCart, clearCart } from './cartManager.js';
import { getProducts } from './productsData.js';
import { getDeliveryFee } from './delivery-zones.js';
import { showToast, showWaitingModal, hideWaitingModal, showConfirmation, showAlertModal, closeConfirmation } from './uiUpdater.js';

document.addEventListener('DOMContentLoaded', async () => {
    // DOM Elements
    const summaryItemsContainer = document.getElementById('summaryItems');
    const summarySubtotalEl = document.getElementById('summarySubtotal');
    const summaryDeliveryFeeEl = document.getElementById('summaryDeliveryFee');
    const summaryTotalEl = document.getElementById('summaryTotal');
    const addressInput = document.getElementById('address');
    const checkoutForm = document.getElementById('checkoutForm');
    const placeOrderBtn = document.getElementById('placeOrderBtn');
    const downloadReceiptBtn = document.getElementById('downloadReceiptBtn');
    const continueShoppingButton = document.getElementById('continueShoppingButton');

    let allProducts = [];
    let currentSubtotal = 0;

    // 1. Authentication Check
    auth.onAuthStateChanged(async user => {
        if (!user) {
            showToast("Please log in to proceed to checkout.");
            setTimeout(() => {
                window.location.href = 'login.html';
            }, 2000);
        } else {
            // Fetch products and render the initial summary
            const productsData = await getProducts();
            allProducts = productsData.all || [];
            renderOrderSummary();
        }
    });

    // 2. Render Order Summary
    function renderOrderSummary() {
        const cart = getCart();
        if (cart.length === 0 && window.location.pathname.endsWith('checkout.html')) {
             showToast("Your cart is empty. Redirecting to catalog...");
             setTimeout(() => window.location.href = 'catalog.html', 2000);
             return;
        }

        summaryItemsContainer.innerHTML = '';
        currentSubtotal = 0;

        cart.forEach(item => {
            const product = allProducts.find(p => p.id === item.id);
            if (product) {
                const itemTotal = product.price * item.quantity;
                currentSubtotal += itemTotal;

                const itemDiv = document.createElement('div');
                itemDiv.className = 'summary-item text-sm';
                itemDiv.innerHTML = `
                    <div>
                        <p class="font-medium">${product.name}</p>
                        <p class="text-gray-500">Quantity: ${item.quantity}</p>
                    </div>
                    <span class="text-gray-700">KSh ${itemTotal.toLocaleString()}</span>
                `;
                summaryItemsContainer.appendChild(itemDiv);
            }
        });

        updateTotals();
    }

    // 3. Update Totals (Subtotal, Delivery, Grand Total)
    function updateTotals() {
        const deliveryAddress = addressInput.value;
        const deliveryFee = getDeliveryFee(deliveryAddress);
        const total = currentSubtotal + deliveryFee;

        summarySubtotalEl.textContent = `KSh ${currentSubtotal.toLocaleString()}`;
        summaryDeliveryFeeEl.textContent = `KSh ${deliveryFee.toLocaleString()}`;
        summaryTotalEl.textContent = `KSh ${total.toLocaleString()}`;
    }

    // 4. Event Listener for Address Input (Real-time Fee Update)
    if (addressInput) {
        addressInput.addEventListener('input', updateTotals);
    }

    // 5. Form Submission Logic
    if (checkoutForm) {
        checkoutForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            placeOrderBtn.disabled = true;
            placeOrderBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...';

            try {
                const cart = getCart();
                const deliveryAddress = addressInput.value;
                const deliveryFee = getDeliveryFee(deliveryAddress);
                const total = currentSubtotal + deliveryFee;

                const orderDetails = {
                    orderNumber: `TTG-${Date.now().toString().slice(-6)}`,
                    userId: auth.currentUser.uid,
                    fullName: document.getElementById('fullName').value,
                    phone: document.getElementById('phone').value,
                    address: deliveryAddress,
                    items: cart.map(item => {
                        const product = allProducts.find(p => p.id === item.id);
                        return { ...item, name: product.name, price: product.price, unit: product.unit };
                    }),
                    total: total,
                    paymentMethod: document.querySelector('input[name="paymentMethod"]:checked').value,
                    deliveryFee: deliveryFee
                };

                if (orderDetails.paymentMethod === 'mpesa') {
                    await handleMpesaPayment(orderDetails);
                } else {
                    await handlePayOnDelivery(orderDetails);
                }

            } catch (error) {
                console.error("Checkout error:", error);
                showAlertModal(error.message, "Payment Error", "error");
            } finally {
                const paymentMethod = document.querySelector('input[name="paymentMethod"]:checked').value;
                if (paymentMethod !== 'mpesa') {
                     placeOrderBtn.disabled = false;
                     placeOrderBtn.innerHTML = 'Place Order';
                }
            }
        });
    }
    
    // --- Payment Handlers ---
    async function handleMpesaPayment(orderDetails) {
        const functionUrl = "/.netlify/functions/mpesa/initiateMpesaPayment";
        const response = await fetch(functionUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                phone: orderDetails.phone, 
                amount: orderDetails.total, 
                orderDetails 
            }),
        });

        const responseText = await response.text();

        if (!response.ok) {
            throw new Error(responseText || `M-Pesa API request failed with status ${response.status}`);
        }

        if (!responseText) {
            throw new Error("Received an empty response from the payment function. Please check your .env file and server logs.");
        }

        const result = JSON.parse(responseText);
        
        if (result.error) {
            throw new Error(result.error);
        }
        
        waitForPaymentConfirmation(result.checkoutRequestID);
    }

    async function handlePayOnDelivery(orderDetails) {
        const { data: unpaidOrder, error } = await supabase.from('unpaid_orders').insert([{
            order_number: orderDetails.orderNumber,
            user_id: orderDetails.userId,
            full_name: orderDetails.fullName,
            phone: orderDetails.phone,
            address: orderDetails.address,
            items: orderDetails.items,
            total: orderDetails.total,
            payment_status: 'unpaid',
            payment_method: 'delivery',
            delivery_fee: orderDetails.deliveryFee
        }]).select().single();

        if (error) throw error;

        clearCart();
        showConfirmation(unpaidOrder.order_number, unpaidOrder);
    }

    // --- M-Pesa Polling ---
    function waitForPaymentConfirmation(checkoutRequestID) {
        const pollUrl = "/.netlify/functions/mpesa/getPaymentStatus";
        const POLLING_INTERVAL = 3000;
        const TIMEOUT_DURATION = 90000;
        let pollIntervalId, timeoutId;

        showWaitingModal();

        timeoutId = setTimeout(() => {
            clearInterval(pollIntervalId);
            hideWaitingModal();
            showAlertModal("Payment timed out. Please try again or check your M-Pesa account.", "Payment Timeout", "error");
            placeOrderBtn.disabled = false;
            placeOrderBtn.innerHTML = 'Place Order';
        }, TIMEOUT_DURATION);

        pollIntervalId = setInterval(async () => {
            try {
                const response = await fetch(pollUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ checkoutRequestID }),
                });
                const result = await response.json();
                if (!response.ok) throw new Error(result.error || 'Polling error.');

                if (result.status === 'paid') {
                    clearInterval(pollIntervalId);
                    clearTimeout(timeoutId);
                    hideWaitingModal();
                    showToast("Payment successful!");
                    clearCart();
                    showConfirmation(result.finalOrder.order_number, result.finalOrder);
                } else if (result.status === 'failed' || result.status === 'cancelled') {
                    clearInterval(pollIntervalId);
                    clearTimeout(timeoutId);
                    hideWaitingModal();
                    showAlertModal(`Your payment was not completed: ${result.message || 'The transaction was cancelled.'}. Please try again.`, "Payment Unsuccessful", "error");
                    placeOrderBtn.disabled = false;
                    placeOrderBtn.innerHTML = 'Place Order';
                }
            } catch (error) {
                clearInterval(pollIntervalId);
                clearTimeout(timeoutId);
                hideWaitingModal();
                showAlertModal(`An error occurred while checking payment status: ${error.message}`, "Error", "error");
                placeOrderBtn.disabled = false;
                placeOrderBtn.innerHTML = 'Place Order';
            }
        }, POLLING_INTERVAL);
    }

    // --- Download Receipt ---
    if (downloadReceiptBtn) {
        downloadReceiptBtn.addEventListener('click', async () => {
            const orderId = downloadReceiptBtn.dataset.orderId;
            const orderNumber = downloadReceiptBtn.dataset.orderNumber;
            const originalText = downloadReceiptBtn.innerHTML;
            downloadReceiptBtn.disabled = true;
            downloadReceiptBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Generating...';

            try {
                const response = await fetch('/.netlify/functions/generate-receipt', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ orderId: orderId })
                });

                if (!response.ok) {
                    const errorBody = await response.json();
                    throw new Error(errorBody.error || 'Failed to generate receipt.');
                }

                const blob = await response.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.style.display = 'none';
                a.href = url;
                a.download = `receipt-${orderNumber || orderId}.pdf`; // Use order number for filename
                document.body.appendChild(a);
                a.click();
                window.URL.revokeObjectURL(url);
                a.remove();
            } catch (error) {
                showToast(`Error: ${error.message}`);
            } finally {
                downloadReceiptBtn.disabled = false;
                downloadReceiptBtn.innerHTML = originalText;
            }
        });
    }

    // --- ADDED: Event listener for the new "Continue Shopping" button ---
    if (continueShoppingButton) {
        continueShoppingButton.addEventListener('click', () => {
            closeConfirmation();
            window.location.href = 'catalog.html';
        });
    }
});

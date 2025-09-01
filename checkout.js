// checkout.js
// This script handles all logic for the dedicated checkout page.

import { auth } from './firebase-config.js';
import { supabase } from './supabase-config.js';
import { getCart, clearCart } from './cartManager.js';
import { getProducts } from './productsData.js';
import { getDeliveryFee, zones } from './delivery-zones.js'; // Import zones for autocomplete
import { showToast, showWaitingModal, hideWaitingModal, showConfirmation, showAlertModal, closeConfirmation } from './uiUpdater.js';

document.addEventListener('DOMContentLoaded', async () => {
    // DOM Elements
    const summaryItemsContainer = document.getElementById('summaryItems');
    const summarySubtotalEl = document.getElementById('summarySubtotal');
    const summaryDeliveryFeeEl = document.getElementById('summaryDeliveryFee');
    const summaryTotalEl = document.getElementById('summaryTotal');
    const checkoutForm = document.getElementById('checkoutForm');
    const placeOrderBtn = document.getElementById('placeOrderBtn');
    const downloadReceiptBtn = document.getElementById('downloadReceiptBtn');
    const continueShoppingButton = document.getElementById('continueShoppingButton');

    // New location elements
    const zoneInput = document.getElementById('zoneInput');
    const zoneSuggestions = document.getElementById('zoneSuggestions');
    const specificAddressInput = document.getElementById('specificAddressInput');

    let allProducts = [];
    let currentSubtotal = 0;

    // --- Autocomplete Setup ---
    const allLocations = Object.values(zones || {}).flat();
    const uniqueLocations = [...new Set(allLocations)];

    // 1. Authentication Check
    auth.onAuthStateChanged(async user => {
        if (!user) {
            showToast("Please log in to proceed to checkout.");
            setTimeout(() => {
                window.location.href = 'login.html';
            }, 2000);
        } else {
            try {
                const productsData = await getProducts();
                allProducts = productsData.all || [];
                renderOrderSummary();
            } catch (error) {
                console.error("Failed to load initial data:", error);
                showAlertModal("Could not load page data. Please try refreshing.", "Error");
            }
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

    // 3. Update Totals
    function updateTotals() {
        const deliveryZone = zoneInput.value;
        const deliveryFee = getDeliveryFee(deliveryZone);
        const total = currentSubtotal + deliveryFee;
        summarySubtotalEl.textContent = `KSh ${currentSubtotal.toLocaleString()}`;
        summaryDeliveryFeeEl.textContent = deliveryFee > 0 ? `KSh ${deliveryFee.toLocaleString()}` : `KSh 0`;
        summaryTotalEl.textContent = `KSh ${total.toLocaleString()}`;
    }

    // --- New Zone Validation Function ---
    function validateZoneInput() {
        const deliveryZone = zoneInput.value.trim();
        const isValid = uniqueLocations.some(loc => loc.toLowerCase() === deliveryZone.toLowerCase());

        // An empty field shouldn't be red. Only show error if text is present but invalid.
        if (deliveryZone && !isValid) {
            zoneInput.classList.remove('border-gray-300', 'focus:ring-green-500');
            zoneInput.classList.add('border-red-500', 'focus:ring-red-500');
        } else {
            zoneInput.classList.remove('border-red-500', 'focus:ring-red-500');
            zoneInput.classList.add('border-gray-300', 'focus:ring-green-500');
        }
    }

    // 4. Zone Autocomplete & Typing Logic
    function handleZoneAutocomplete() {
        const inputText = zoneInput.value;
        if (inputText.length < 2) {
            zoneSuggestions.innerHTML = '';
            zoneSuggestions.classList.add('hidden');
            return;
        }
        const matches = uniqueLocations.filter(loc => loc.toLowerCase().includes(inputText.toLowerCase()));
        if (matches.length > 0) {
            zoneSuggestions.innerHTML = matches.slice(0, 5)
                .map(match => `<div class="suggestion-item" data-full-text="${match}">${match}</div>`).join('');
            zoneSuggestions.classList.remove('hidden');
        } else {
            zoneSuggestions.classList.add('hidden');
        }
    }

    if (zoneInput) {
        zoneInput.addEventListener('input', () => {
            updateTotals();
            handleZoneAutocomplete();
            validateZoneInput();
        });
        zoneInput.addEventListener('blur', () => {
            // Delay hiding suggestions and validation to allow click event to fire
            setTimeout(() => {
                zoneSuggestions.classList.add('hidden');
                validateZoneInput();
            }, 200);
        });
    }

    if (zoneSuggestions) {
        zoneSuggestions.addEventListener('click', (event) => {
            const suggestionItem = event.target.closest('.suggestion-item');
            if (suggestionItem) {
                zoneInput.value = suggestionItem.dataset.fullText;
                zoneSuggestions.classList.add('hidden');
                updateTotals();
                validateZoneInput(); // Re-validate after selection
                zoneInput.focus();
            }
        });
    }

    // 5. Form Submission Logic
    if (checkoutForm) {
        checkoutForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            placeOrderBtn.disabled = true;
            placeOrderBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...';
            try {
                const cart = getCart();
                const deliveryZone = zoneInput.value;
                const specificAddress = specificAddressInput.value;

                if (!deliveryZone || !specificAddress) {
                    showAlertModal("Please provide both your zone/area and specific address.", "Incomplete Address");
                    placeOrderBtn.disabled = false;
                    placeOrderBtn.innerHTML = 'Place Order';
                    return; 
                }

                // --- New Validation Check ---
                if (!uniqueLocations.some(loc => loc.toLowerCase() === deliveryZone.toLowerCase())) {
                    showAlertModal("Please select a valid delivery zone from the suggested list.", "Invalid Zone");
                    placeOrderBtn.disabled = false;
                    placeOrderBtn.innerHTML = 'Place Order';
                    return;
                }
                
                const fullAddress = `${specificAddress}, ${deliveryZone}`;
                const deliveryFee = getDeliveryFee(deliveryZone);
                const total = currentSubtotal + deliveryFee;

                const orderDetails = {
                    orderNumber: `TTG-${Date.now().toString().slice(-6)}`,
                    userId: auth.currentUser.uid,
                    fullName: document.getElementById('fullName').value,
                    phone: document.getElementById('phone').value,
                    address: fullAddress,
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
        if (!response.ok) throw new Error(responseText || `M-Pesa API request failed`);
        if (!responseText) throw new Error("Received an empty response from the payment function.");
        const result = JSON.parse(responseText);
        if (result.error) throw new Error(result.error);
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
            showAlertModal("Payment timed out. Please try again.", "Payment Timeout", "error");
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
                    showAlertModal(`Payment was not completed: ${result.message || 'Cancelled.'}`, "Payment Unsuccessful", "error");
                    placeOrderBtn.disabled = false;
                    placeOrderBtn.innerHTML = 'Place Order';
                }
            } catch (error) {
                clearInterval(pollIntervalId);
                clearTimeout(timeoutId);
                hideWaitingModal();
                showAlertModal(`Error checking payment status: ${error.message}`, "Error", "error");
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
                a.download = `receipt-${orderNumber || orderId}.pdf`;
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

    // --- Continue Shopping Button Logic ---
    if (continueShoppingButton) {
        continueShoppingButton.addEventListener('click', () => {
            closeConfirmation();
            window.location.href = 'catalog.html';
        });
    }
});


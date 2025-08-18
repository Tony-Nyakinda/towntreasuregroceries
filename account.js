// account.js
// This script handles the logic for the "My Account" page.

// AMENDMENT: Import Supabase client instead of Firebase db
import { db, auth } from './firebase-config.js';
import { supabase } from './supabase-config.js';
import { getCurrentUserWithRole, logout } from './auth.js';
import { showToast, showWaitingModal, hideWaitingModal } from './uiUpdater.js';

document.addEventListener('DOMContentLoaded', async () => {
    // DOM Elements
    const loader = document.getElementById('loader');
    const mainContent = document.getElementById('mainContent');
    const userProfileSection = document.getElementById('userProfileSection');
    const profileInitials = document.getElementById('profileInitials');
    const profileName = document.getElementById('profileName');
    const profileEmail = document.getElementById('profileEmail');
    const logoutButton = document.getElementById('logoutButton');
    const unpaidOrdersGrid = document.getElementById('unpaidOrdersGrid');
    
    // Mobile Menu DOM Elements
    const mobileMenuButton = document.getElementById('mobileMenuButton');
    const mobileMenu = document.getElementById('mobileMenu');
    const closeMobileMenuButton = document.getElementById('closeMobileMenuButton');
    const overlay = document.getElementById('overlay');

    const { user } = await getCurrentUserWithRole();

    // Page Guard: Redirect if user is not logged in
    if (!user) {
        window.location.href = 'login.html';
        return; // Stop script execution
    }

    // If user is logged in, hide loader and show content
    loader.style.display = 'none';
    mainContent.classList.remove('hidden');


    // --- Display User Profile ---
    if (userProfileSection) {
        userProfileSection.classList.remove('hidden');
        const displayName = user.displayName || 'No Name';
        const email = user.email;
        
        if (profileInitials) {
            const initials = displayName.split(' ').map(n => n[0]).join('').toUpperCase();
            profileInitials.textContent = initials;
        }
        if (profileName) profileName.textContent = displayName;
        if (profileEmail) profileEmail.textContent = email;
        if (logoutButton) logoutButton.addEventListener('click', async () => {
            await logout();
            window.location.href = 'index.html';
        });
    }

    // --- Fetch and Display Unpaid Orders from SUPABASE ---
    async function fetchUnpaidOrders() {
        if (!unpaidOrdersGrid) return;

        try {
            // AMENDMENT: Fetch from Supabase 'unpaid_orders' table
            const { data, error } = await supabase
                .from('unpaid_orders')
                .select('*')
                .eq('userId', user.uid)
                .eq('paymentStatus', 'unpaid');

            if (error) {
                console.error("Error fetching unpaid orders from Supabase:", error);
                unpaidOrdersGrid.innerHTML = '<p class="text-center text-red-500">Could not load your orders. Please try again later.</p>';
                return;
            }

            if (!data || data.length === 0) {
                unpaidOrdersGrid.innerHTML = '<p class="text-center text-gray-500">You have no pending orders to pay.</p>';
                return;
            }

            unpaidOrdersGrid.innerHTML = ''; // Clear loader
            data.forEach(order => {
                const orderCard = createOrderCard(order);
                unpaidOrdersGrid.appendChild(orderCard);
            });

        } catch (error) {
            console.error("Error fetching unpaid orders:", error);
            unpaidOrdersGrid.innerHTML = '<p class="text-center text-red-500">Could not load your orders. Please try again later.</p>';
        }
    }

    // --- Create Order Card HTML ---
    function createOrderCard(order) {
        const card = document.createElement('div');
        card.className = 'bg-white p-4 rounded-lg shadow-md flex flex-col md:flex-row justify-between items-start md:items-center';
        
        // AMENDMENT: Handle Supabase timestamp which is a string
        const orderDate = order.timestamp ? new Date(order.timestamp).toLocaleDateString() : 'N/A';

        card.innerHTML = `
            <div>
                <p class="font-bold text-lg text-green-600">Order #${order.orderNumber}</p>
                <p class="text-sm text-gray-500">Date: ${orderDate}</p>
                <p class="font-semibold mt-2">Total: KSh ${order.total.toLocaleString()}</p>
            </div>
            <button class="pay-now-btn mt-4 md:mt-0 bg-green-500 text-white py-2 px-6 rounded-md hover:bg-green-600 transition duration-300" data-order-id="${order.orderNumber}">
                Pay Now
            </button>
        `;
        return card;
    }
    
    // --- Handle "Pay Now" Button Click ---
    unpaidOrdersGrid.addEventListener('click', async (event) => {
        if (event.target.classList.contains('pay-now-btn')) {
            const button = event.target;
            const orderNumber = button.dataset.orderId;
            
            button.disabled = true;
            button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...';

            try {
                // AMENDMENT: Fetch order details from Supabase using orderNumber
                const { data: orderDetails, error } = await supabase
                    .from('unpaid_orders')
                    .select('*')
                    .eq('orderNumber', orderNumber)
                    .single();
                
                if (error || !orderDetails) {
                    throw new Error("Order not found or an error occurred.");
                }

                // Initiate M-Pesa payment
                const functionUrl = "https://towntreasuregroceries.netlify.app/.netlify/functions/mpesa/initiateMpesaPayment";
                const mpesaResponse = await fetch(functionUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        phone: orderDetails.phone,
                        amount: orderDetails.total,
                        orderDetails: orderDetails
                    }),
                });

                const mpesaResult = await mpesaResponse.json();

                if (!mpesaResponse.ok) {
                    throw new Error(mpesaResult.error || 'M-Pesa API request failed.');
                }
                
                // Wait for payment confirmation
                showWaitingModal();
                // AMENDMENT: Call the polling function for status check
                waitForPaymentConfirmation(mpesaResult.checkoutRequestID, orderNumber);

            } catch (error) {
                console.error("Error initiating payment for order:", error);
                showToast(`Payment failed: ${error.message}`);
                button.disabled = false;
                button.innerHTML = 'Pay Now';
            }
        }
    });

    // --- REPLACED: Listen for Payment Confirmation using Polling ---
    function waitForPaymentConfirmation(checkoutRequestID, unpaidOrderNumber) {
        const TIMEOUT_DURATION = 90000; // 90 seconds
        const POLL_INTERVAL = 3000; // Poll every 3 seconds

        let timeoutExceeded = false;
        let pollIntervalId;

        const timeoutId = setTimeout(() => {
            timeoutExceeded = true;
            clearInterval(pollIntervalId);
            hideWaitingModal();
            showToast("Payment timed out. Please try again.");
            // Re-enable the button
            const button = unpaidOrdersGrid.querySelector(`[data-order-id="${unpaidOrderNumber}"]`);
            if (button) {
                button.disabled = false;
                button.innerHTML = 'Pay Now';
            }
        }, TIMEOUT_DURATION);

        pollIntervalId = setInterval(async () => {
            if (timeoutExceeded) return;

            try {
                // AMENDMENT: Fetch status from the Firebase public status document
                const statusDocRef = db.collection('payment_status').doc(checkoutRequestID);
                const doc = await statusDocRef.get();
                const statusData = doc.data();

                if (statusData) {
                    if (statusData.status === 'paid') {
                        clearInterval(pollIntervalId);
                        clearTimeout(timeoutId);
                        hideWaitingModal();
                        showToast("Payment successful! Your order is confirmed.");
                        // Refresh the list of unpaid orders
                        fetchUnpaidOrders();
                    } else if (statusData.status === 'failed') {
                        clearInterval(pollIntervalId);
                        clearTimeout(timeoutId);
                        hideWaitingModal();
                        const reason = statusData.reason || "Payment was not completed.";
                        showToast(`Payment failed: ${reason}`);
                        // Re-enable the button
                        const button = unpaidOrdersGrid.querySelector(`[data-order-id="${unpaidOrderNumber}"]`);
                        if (button) {
                            button.disabled = false;
                            button.innerHTML = 'Pay Now';
                        }
                    }
                }
            } catch (error) {
                console.error("Error checking payment status:", error);
                clearInterval(pollIntervalId);
                clearTimeout(timeoutId);
                hideWaitingModal();
                showToast("Error checking payment status.");
                // Re-enable the button on error
                 const button = unpaidOrdersGrid.querySelector(`[data-order-id="${unpaidOrderNumber}"]`);
                 if (button) {
                     button.disabled = false;
                     button.innerHTML = 'Pay Now';
                 }
            }
        }, POLL_INTERVAL);
    }


    // --- Mobile Menu Toggle Logic ---\
    function toggleMobileMenu() {
        const isActive = mobileMenu.classList.contains('is-active');
        if (isActive) {
            mobileMenu.classList.remove('is-active');
            overlay.classList.add('hidden');
            document.body.style.overflow = '';
        } else {
            mobileMenu.classList.add('is-active');
            overlay.classList.remove('hidden');
            document.body.style.overflow = 'hidden';
        }
    }

    if (mobileMenuButton && mobileMenu && closeMobileMenuButton && overlay) {
        mobileMenuButton.addEventListener('click', toggleMobileMenu);
        closeMobileMenuButton.addEventListener('click', toggleMobileMenu);
        overlay.addEventListener('click', () => {
            if (mobileMenu.classList.contains('is-active')) {
                toggleMobileMenu();
            }
        });
    }

    // Initial fetch of orders
    fetchUnpaidOrders();
});

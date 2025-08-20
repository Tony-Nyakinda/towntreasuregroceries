// account.js
// This script handles the logic for the "My Account" page.
// MIGRATED: All order data is now fetched from and managed in Supabase.
// Firebase is still used for user authentication.

import { supabase } from './supabase-config.js'; // <-- NEW: Import Supabase client
import { auth } from './firebase-config.js'; // <-- KEPT: For user authentication
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

    // Still using Firebase to get the currently logged-in user
    const { user } = await getCurrentUserWithRole();

    // Page Guard: Redirect if user is not logged in
    if (!user) {
        window.location.href = 'login.html';
        return; // Stop script execution
    }

    // If user is logged in, hide loader and show content
    loader.style.display = 'none';
    mainContent.classList.remove('hidden');


    // --- Display User Profile (No Changes Here) ---
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

        // Use the Firebase user's UID to query the Supabase database
        const { data: orders, error } = await supabase
            .from('unpaid_orders')
            .select('*')
            .eq('user_id', user.uid);
        
        if (error) {
            console.error("Error fetching unpaid orders from Supabase:", error);
            unpaidOrdersGrid.innerHTML = '<p class="text-center text-red-500">Could not load your orders. Please try again later.</p>';
            return;
        }

        if (!orders || orders.length === 0) {
            unpaidOrdersGrid.innerHTML = '<p class="text-center text-gray-500">You have no pending orders to pay.</p>';
            return;
        }

        unpaidOrdersGrid.innerHTML = ''; // Clear loader
        orders.forEach(order => {
            const orderCard = createOrderCard(order);
            unpaidOrdersGrid.appendChild(orderCard);
        });
    }

    // --- Create Order Card HTML (Updated for snake_case) ---
    function createOrderCard(order) {
        const card = document.createElement('div');
        card.className = 'bg-white p-4 rounded-lg shadow-md flex flex-col md:flex-row justify-between items-start md:items-center';
        
        const orderDate = order.created_at ? new Date(order.created_at).toLocaleDateString() : 'N/A';

        card.innerHTML = `
            <div>
                <p class="font-bold text-lg text-green-600">Order #${order.order_number}</p>
                <p class="text-sm text-gray-500">Date: ${orderDate}</p>
                <p class="font-semibold mt-2">Total: KSh ${order.total.toLocaleString()}</p>
            </div>
            <button class="pay-now-btn mt-4 md:mt-0 bg-green-500 text-white py-2 px-6 rounded-md hover:bg-green-600 transition duration-300" data-order-id="${order.id}">
                Pay Now
            </button>
        `;
        return card;
    }
    
    // --- ADDED: Payment Status Polling Function ---
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
            fetchUnpaidOrders(); // Refresh list to re-enable button
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
                    fetchUnpaidOrders(); // Refresh the order list immediately
                } else if (result.status === 'failed' || result.status === 'cancelled') {
                    clearInterval(pollIntervalId);
                    clearTimeout(timeoutId);
                    hideWaitingModal();
                    showToast(`Payment failed: ${result.message}`);
                    fetchUnpaidOrders(); // Refresh list to re-enable button
                }
            } catch (error) {
                console.error("Error during polling for payment status:", error);
                clearInterval(pollIntervalId);
                clearTimeout(timeoutId);
                hideWaitingModal();
                showToast("Error checking payment status. Please check your M-Pesa account.");
                fetchUnpaidOrders(); // Refresh list to re-enable button
            }
        }, POLLING_INTERVAL);
    }

    // --- Handle "Pay Now" Button Click (Updated for Supabase) ---
    unpaidOrdersGrid.addEventListener('click', async (event) => {
        if (event.target.classList.contains('pay-now-btn')) {
            const button = event.target;
            const orderId = button.dataset.orderId;
            
            button.disabled = true;
            button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...';

            try {
                const { data: orderDetails, error: fetchError } = await supabase
                    .from('unpaid_orders')
                    .select('*')
                    .eq('id', orderId)
                    .single();

                if (fetchError || !orderDetails) {
                    throw new Error("Order not found or could not be fetched.");
                }

                const formattedOrderDetails = {
                    orderNumber: orderDetails.order_number,
                    userId: orderDetails.user_id,
                    fullName: orderDetails.full_name,
                    phone: orderDetails.phone,
                    address: orderDetails.address,
                    instructions: orderDetails.instructions,
                    items: orderDetails.items,
                    total: orderDetails.total,
                    paymentMethod: orderDetails.payment_method
                };

                const functionUrl = "https://towntreasuregroceries.netlify.app/.netlify/functions/mpesa/initiateMpesaPayment";
                const mpesaResponse = await fetch(functionUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        phone: formattedOrderDetails.phone,
                        amount: formattedOrderDetails.total,
                        orderDetails: formattedOrderDetails,
                        unpaidOrderId: orderId
                    }),
                });

                const mpesaResult = await mpesaResponse.json();

                if (!mpesaResponse.ok) {
                    throw new Error(mpesaResult.error || 'M-Pesa API request failed.');
                }
                
                // --- REPLACED: The old setTimeout with the new polling function ---
                waitForPaymentConfirmation(mpesaResult.checkoutRequestID);
                
            } catch (error) {
                console.error("Error initiating payment for order:", error);
                showToast(`Payment failed: ${error.message}`);
                // No need to re-enable button here, polling function handles it
            }
        }
    });

    // --- Mobile Menu Toggle Logic (No Changes Here) ---
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

    // Initial fetch of orders from Supabase
    fetchUnpaidOrders();
});
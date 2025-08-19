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
            .eq('user_id', user.uid); // Filter by the Firebase user ID
        
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

    // --- Create Order Card HTML (No Changes Here) ---
    function createOrderCard(order) {
        const card = document.createElement('div');
        card.className = 'bg-white p-4 rounded-lg shadow-md flex flex-col md:flex-row justify-between items-start md:items-center';
        
        // Supabase stores timestamps in a format that can be directly used by new Date()
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
    
    // --- Handle "Pay Now" Button Click (Updated for Supabase) ---
    unpaidOrdersGrid.addEventListener('click', async (event) => {
        if (event.target.classList.contains('pay-now-btn')) {
            const button = event.target;
            const orderId = button.dataset.orderId; // This is the Supabase UUID
            
            button.disabled = true;
            button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...';

            try {
                // Fetch the order details from Supabase using the order ID
                const { data: orderDetails, error: fetchError } = await supabase
                    .from('unpaid_orders')
                    .select('*')
                    .eq('id', orderId)
                    .single(); // .single() expects one row and simplifies the result

                if (fetchError || !orderDetails) {
                    throw new Error("Order not found or could not be fetched.");
                }

                // The call to the Netlify function remains the same.
                // The function will handle the M-Pesa logic and update Supabase on the backend.
                const functionUrl = "https://towntreasuregroceries.netlify.app/.netlify/functions/mpesa/initiateMpesaPayment";
                const mpesaResponse = await fetch(functionUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        phone: orderDetails.phone,
                        amount: orderDetails.total,
                        orderDetails: orderDetails,
                        unpaidOrderId: orderId // Pass the Supabase ID to the backend
                    }),
                });

                const mpesaResult = await mpesaResponse.json();

                if (!mpesaResponse.ok) {
                    throw new Error(mpesaResult.error || 'M-Pesa API request failed.');
                }
                
                showWaitingModal();
                // We no longer need to wait for confirmation on the client-side.
                // The backend will handle the database updates. We can just show a success message
                // and refresh the order list after a delay.
                setTimeout(() => {
                    hideWaitingModal();
                    showToast("Payment request sent! Please check your phone to complete.");
                    // After a few seconds, refresh the list. If payment was successful, the order will be gone.
                    setTimeout(fetchUnpaidOrders, 5000); 
                }, 10000); // Give user time to see the modal

            } catch (error) {
                console.error("Error initiating payment for order:", error);
                showToast(`Payment failed: ${error.message}`);
                button.disabled = false;
                button.innerHTML = 'Pay Now';
            }
        }
    });

    // --- REMOVED: waitForPaymentConfirmation function ---
    // This logic is now handled entirely by the mpesa.js backend function.
    // The frontend no longer needs to listen for Firestore changes.

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

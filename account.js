// account.js
// This script handles the logic for the "My Account" page.
// It fetches and displays unpaid orders and paid order history from Supabase.
// It also handles the M-Pesa payment flow for unpaid orders.

import { supabase } from './supabase-config.js';
import { auth } from './firebase-config.js';
import { getCurrentUserWithRole, logout } from './auth.js';
import { showToast, showWaitingModal, hideWaitingModal, showConfirmation, closeConfirmation } from './uiUpdater.js';

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
    const paidOrdersGrid = document.getElementById('paidOrdersGrid');
    const continueShoppingButton = document.getElementById('continueShoppingButton');
    
    // --- AMENDMENT: Add reference to the download receipt button ---
    const downloadReceiptBtn = document.getElementById('downloadReceiptBtn');

    // Mobile Menu DOM Elements
    const mobileMenuButton = document.getElementById('mobileMenuButton');
    const mobileMenu = document.getElementById('mobileMenu');
    const closeMobileMenuButton = document.getElementById('closeMobileMenuButton');
    const overlay = document.getElementById('overlay');

    const { user } = await getCurrentUserWithRole();

    // Page Guard: Redirect if user is not logged in
    if (!user) {
        window.location.href = 'login.html';
        return;
    }

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

    // --- Fetch and Display Unpaid Orders ---
    async function fetchUnpaidOrders() {
        if (!unpaidOrdersGrid) return;
        const { data: orders, error } = await supabase.from('unpaid_orders').select('*').eq('user_id', user.uid);
        if (error) {
            console.error("Error fetching unpaid orders:", error);
            unpaidOrdersGrid.innerHTML = '<p class="text-center text-red-500">Could not load your orders.</p>';
            return;
        }
        if (!orders || orders.length === 0) {
            unpaidOrdersGrid.innerHTML = '<p class="text-center text-gray-500">You have no pending orders to pay.</p>';
            return;
        }
        unpaidOrdersGrid.innerHTML = '';
        orders.forEach(order => unpaidOrdersGrid.appendChild(createUnpaidOrderCard(order)));
    }

    // --- Fetch and Display Paid Orders (History) ---
    async function fetchPaidOrders() {
        if (!paidOrdersGrid) return;
        const { data: orders, error } = await supabase.from('paid_orders').select('*').eq('user_id', user.uid).order('created_at', { ascending: false });
        if (error) {
            console.error("Error fetching paid orders:", error);
            paidOrdersGrid.innerHTML = '<p class="text-center text-red-500">Could not load your order history.</p>';
            return;
        }
        if (!orders || orders.length === 0) {
            paidOrdersGrid.innerHTML = '<p class="text-center text-gray-500">You have no completed orders yet.</p>';
            return;
        }
        paidOrdersGrid.innerHTML = '';
        orders.forEach(order => paidOrdersGrid.appendChild(createPaidOrderCard(order)));
    }

    // --- Create HTML Cards for Orders ---
    function createUnpaidOrderCard(order) {
        const card = document.createElement('div');
        card.className = 'bg-white p-4 rounded-lg shadow-md flex flex-col md:flex-row justify-between items-start md:items-center';
        const orderDate = order.created_at ? new Date(order.created_at).toLocaleDateString() : 'N/A';
        card.innerHTML = `
            <div>
                <p class="font-bold text-lg text-green-600">Order #${order.order_number}</p>
                <p class="text-sm text-gray-500">Date: ${orderDate}</p>
                <p class="font-semibold mt-2">Total: KSh ${order.total.toLocaleString()}</p>
            </div>
            <button class="pay-now-btn mt-4 md:mt-0 bg-green-500 text-white py-2 px-6 rounded-md hover:bg-green-600" data-order-id="${order.id}">Pay Now</button>`;
        return card;
    }

    function createPaidOrderCard(order) {
        const card = document.createElement('div');
        card.className = 'bg-white p-4 rounded-lg shadow-md';
        const orderDate = order.created_at ? new Date(order.created_at).toLocaleDateString() : 'N/A';
        card.innerHTML = `
            <div class="flex flex-col md:flex-row justify-between items-start md:items-center">
                <div>
                    <p class="font-bold text-lg text-gray-800">Order #${order.order_number}</p>
                    <p class="text-sm text-gray-500">Date: ${orderDate}</p>
                    <p class="font-semibold mt-2">Total Paid: KSh ${order.total.toLocaleString()}</p>
                </div>
                <div class="mt-4 md:mt-0 md:text-right">
                    <p class="text-sm font-medium text-gray-600">Status: <span class="text-green-600 font-bold capitalize">${order.payment_status}</span></p>
                    <p class="text-sm text-gray-500">M-Pesa Receipt: <span class="font-mono">${order.mpesa_receipt_number || 'N/A'}</span></p>
                </div>
            </div>`;
        return card;
    }
    
    // --- Payment Status Polling Function ---
    function waitForPaymentConfirmation(checkoutRequestID) {
        const pollUrl = "https://towntreasuregroceries.netlify.app/.netlify/functions/mpesa/getPaymentStatus";
        const POLLING_INTERVAL = 3000;
        const TIMEOUT_DURATION = 90000;
        let pollIntervalId = null, timeoutId = null;

        showWaitingModal();

        timeoutId = setTimeout(() => {
            clearInterval(pollIntervalId);
            hideWaitingModal();
            showToast("Payment timed out. Please try again.");
            fetchUnpaidOrders();
        }, TIMEOUT_DURATION);

        pollIntervalId = setInterval(async () => {
            try {
                const response = await fetch(pollUrl, {
                    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ checkoutRequestID }),
                });
                const result = await response.json();
                if (!response.ok) throw new Error(result.error || 'Server error.');

                if (result.status === 'paid') {
                    clearInterval(pollIntervalId);
                    clearTimeout(timeoutId);
                    hideWaitingModal();
                    showToast("Payment successful!");
                    // Show the confirmation modal with the final order details
                    showConfirmation(result.finalOrder.order_number, result.finalOrder);
                    fetchUnpaidOrders();
                    fetchPaidOrders(); // Refresh history as well
                } else if (result.status === 'failed' || result.status === 'cancelled') {
                    clearInterval(pollIntervalId);
                    clearTimeout(timeoutId);
                    hideWaitingModal();
                    showToast(`Payment failed: ${result.message}`);
                    fetchUnpaidOrders();
                }
            } catch (error) {
                clearInterval(pollIntervalId);
                clearTimeout(timeoutId);
                hideWaitingModal();
                showToast("Error checking payment status.");
                fetchUnpaidOrders();
            }
        }, POLLING_INTERVAL);
    }

    // --- Handle "Pay Now" Button Click ---
    unpaidOrdersGrid.addEventListener('click', async (event) => {
        if (event.target.classList.contains('pay-now-btn')) {
            const button = event.target;
            const orderId = button.dataset.orderId;
            button.disabled = true;
            button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...';
            try {
                const { data: orderDetails, error: fetchError } = await supabase.from('unpaid_orders').select('*').eq('id', orderId).single();
                if (fetchError || !orderDetails) throw new Error("Order not found.");

                const formattedOrderDetails = {
                    orderNumber: orderDetails.order_number, userId: orderDetails.user_id, fullName: orderDetails.full_name,
                    phone: orderDetails.phone, address: orderDetails.address, instructions: orderDetails.instructions,
                    items: orderDetails.items, total: orderDetails.total, paymentMethod: orderDetails.payment_method
                };

                const functionUrl = "https://towntreasuregroceries.netlify.app/.netlify/functions/mpesa/initiateMpesaPayment";
                const mpesaResponse = await fetch(functionUrl, {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ phone: formattedOrderDetails.phone, amount: formattedOrderDetails.total, orderDetails: formattedOrderDetails, unpaidOrderId: orderId }),
                });
                const mpesaResult = await mpesaResponse.json();
                if (!mpesaResponse.ok) throw new Error(mpesaResult.error || 'M-Pesa API failed.');
                
                waitForPaymentConfirmation(mpesaResult.checkoutRequestID);
            } catch (error) {
                showToast(`Payment failed: ${error.message}`);
                // Refresh the list to re-enable the button
                fetchUnpaidOrders();
            }
        }
    });

    // --- AMENDMENT: Add event listener for the receipt download button ---
    if (downloadReceiptBtn) {
        downloadReceiptBtn.addEventListener('click', async () => {
            const orderId = downloadReceiptBtn.dataset.orderId;

            if (!orderId) {
                showToast("Error: Could not find Order ID for receipt.");
                return;
            }

            const originalText = downloadReceiptBtn.innerHTML;
            downloadReceiptBtn.disabled = true;
            downloadReceiptBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Generating...';

            try {
                const response = await fetch('/.netlify/functions/generate-receipt', {
                    method: 'POST',
                    body: JSON.stringify({ orderId: orderId }),
                });

                if (!response.ok) {
                    const err = await response.json();
                    throw new Error(err.error || 'Receipt generation failed.');
                }

                // Handle the PDF download
                const blob = await response.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.style.display = 'none';
                a.href = url;

                const disposition = response.headers.get('content-disposition');
                let filename = 'receipt.pdf';
                if (disposition && disposition.includes('attachment')) {
                    const filenameMatch = /filename="([^"]+)"/.exec(disposition);
                    if (filenameMatch && filenameMatch[1]) {
                        filename = filenameMatch[1];
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


    // --- Event Listener for Confirmation Modal Button ---
    if(continueShoppingButton) {
        // This button now correctly closes the modal, which is its only job here.
        continueShoppingButton.addEventListener('click', closeConfirmation);
    }

    // --- Mobile Menu Toggle Logic ---
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
        overlay.addEventListener('click', () => { if (mobileMenu.classList.contains('is-active')) toggleMobileMenu(); });
    }

    // --- Initial Data Fetch ---
    fetchUnpaidOrders();
    fetchPaidOrders();
});

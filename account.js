// account.js
// This script handles the logic for the "My Account" page.
// It fetches and displays unpaid orders and paid order history from Supabase.
// It also handles the M-Pesa payment flow for unpaid orders.

import { supabase } from './supabase-config.js';
import { auth } from './firebase-config.js';
import { getCurrentUserWithRole, logout } from './auth.js';
import { showToast, showWaitingModal, hideWaitingModal, showConfirmation, closeConfirmation } from './uiUpdater.js';

document.addEventListener('DOMContentLoaded', async () => {
    let allUserOrders = []; 

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
    const downloadReceiptBtn = document.getElementById('downloadReceiptBtn');
    const orderDetailsModal = document.getElementById('orderDetailsModal');
    const closeOrderDetailsModal = document.getElementById('closeOrderDetailsModal');
    const mobileMenuButton = document.getElementById('mobileMenuButton');
    const mobileMenu = document.getElementById('mobileMenu');
    const closeMobileMenuButton = document.getElementById('closeMobileMenuButton');
    const overlay = document.getElementById('overlay');
    const cancelOrderBtn = document.getElementById('cancelOrderBtn');
    const customConfirmModal = document.getElementById('customConfirmModal');
    const confirmModalOkBtn = document.getElementById('confirmModalOkBtn');
    const confirmModalCancelBtn = document.getElementById('confirmModalCancelBtn');

    const { user } = await getCurrentUserWithRole();

    if (!user) {
        window.location.href = 'login.html';
        return;
    }

    loader.style.display = 'none';
    mainContent.classList.remove('hidden');

    // --- Display User Profile ---
    if (userProfileSection) {
        userProfileSection.classList.remove('hidden');
        const displayName = user.displayName || user.email || 'User';
        const email = user.email;
        
        if (profileInitials) {
            const nameParts = displayName.split(' ');
            const initials = nameParts.length > 1 
                ? (nameParts[0][0] + nameParts[nameParts.length - 1][0]).toUpperCase()
                : displayName[0].toUpperCase();
            profileInitials.textContent = initials;
        }
        if (profileName) profileName.textContent = displayName;
        if (profileEmail) profileEmail.textContent = email;
        if (logoutButton) logoutButton.addEventListener('click', async () => {
            await logout();
            window.location.href = 'index.html';
        });
    }

    // --- Fetch Functions ---
    async function fetchUnpaidOrders() {
        if (!unpaidOrdersGrid) return [];
        const { data: orders, error } = await supabase.from('unpaid_orders').select('*').eq('user_id', user.uid).order('created_at', { ascending: false });
        if (error) {
            console.error("Error fetching unpaid orders:", error);
            unpaidOrdersGrid.innerHTML = '<p class="text-center text-red-500">Could not load your orders.</p>';
            return [];
        }
        
        if (!orders || orders.length === 0) {
            unpaidOrdersGrid.innerHTML = '<p class="text-center text-gray-500">You have no pending orders to pay.</p>';
        } else {
            unpaidOrdersGrid.innerHTML = '';
            orders.forEach(order => unpaidOrdersGrid.appendChild(createUnpaidOrderCard(order)));
        }
        return orders;
    }

    async function fetchPaidOrders() {
        if (!paidOrdersGrid) return [];
        const { data: orders, error } = await supabase.from('paid_orders').select('*').eq('user_id', user.uid).order('created_at', { ascending: false });
        if (error) {
            console.error("Error fetching paid orders:", error);
            paidOrdersGrid.innerHTML = '<p class="text-center text-red-500">Could not load your order history.</p>';
            return [];
        }

        if (!orders || orders.length === 0) {
            paidOrdersGrid.innerHTML = '<p class="text-center text-gray-500">You have no completed orders yet.</p>';
        } else {
            paidOrdersGrid.innerHTML = '';
            orders.forEach(order => paidOrdersGrid.appendChild(createPaidOrderCard(order)));
        }
        return orders;
    }

    // --- Create HTML Cards for Orders ---
    function createUnpaidOrderCard(order) {
        const card = document.createElement('div');
        // AMENDMENT: Removed 'order-card-clickable' class
        card.className = 'bg-white p-4 rounded-lg shadow-md flex flex-col md:flex-row justify-between items-start md:items-center';
        card.dataset.orderId = order.id;

        const orderDate = order.created_at ? new Date(order.created_at).toLocaleDateString() : 'N/A';
        // AMENDMENT: Added a "View Details" button and grouped actions
        card.innerHTML = `
            <div class="flex-grow">
                <p class="font-bold text-lg text-yellow-600">Order #${order.order_number}</p>
                <p class="text-sm text-gray-500">Date: ${orderDate}</p>
                <p class="font-semibold mt-2">Total: KSh ${order.total.toLocaleString()}</p>
            </div>
            <div class="flex flex-col md:flex-row items-stretch md:items-center gap-2 mt-4 md:mt-0">
                 <button class="view-details-btn bg-gray-200 text-gray-700 py-2 px-4 rounded-md hover:bg-gray-300" data-order-id="${order.id}">View Details</button>
                <button class="pay-now-btn bg-green-500 text-white py-2 px-6 rounded-md hover:bg-green-600" data-order-id="${order.id}">Pay Now</button>
            </div>`;
        return card;
    }

    function createPaidOrderCard(order) {
        const card = document.createElement('div');
        // AMENDMENT: Removed 'order-card-clickable' class and adjusted layout for the new button
        card.className = 'bg-white p-4 rounded-lg shadow-md flex flex-col md:flex-row justify-between items-start md:items-center';
        card.dataset.orderId = order.id;

        const orderDate = order.created_at ? new Date(order.created_at).toLocaleDateString() : 'N/A';
        // AMENDMENT: Added a "View Details" button and adjusted layout
        card.innerHTML = `
            <div class="flex-grow">
                <p class="font-bold text-lg text-gray-800">Order #${order.order_number}</p>
                <p class="text-sm text-gray-500">Date: ${orderDate}</p>
                <p class="font-semibold mt-2">Total Paid: KSh ${order.total.toLocaleString()}</p>
                <div class="mt-2 md:hidden">
                     <p class="text-sm font-medium text-gray-600">Status: <span class="text-green-600 font-bold capitalize">${order.payment_status}</span></p>
                     <p class="text-sm text-gray-500">M-Pesa Receipt: <span class="font-mono">${order.mpesa_receipt_number || 'N/A'}</span></p>
                </div>
            </div>
            <div class="hidden md:block text-right flex-shrink-0 mx-4">
                <p class="text-sm font-medium text-gray-600">Status: <span class="text-green-600 font-bold capitalize">${order.payment_status}</span></p>
                <p class="text-sm text-gray-500">M-Pesa Receipt: <span class="font-mono">${order.mpesa_receipt_number || 'N/A'}</span></p>
            </div>
            <div class="mt-4 md:mt-0">
                <button class="view-details-btn bg-gray-200 text-gray-700 py-2 px-4 rounded-md hover:bg-gray-300" data-order-id="${order.id}">View Details</button>
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
            fetchAndRenderAllOrders();
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
                    showConfirmation(result.finalOrder.order_number, result.finalOrder);
                    fetchAndRenderAllOrders();
                } else if (result.status === 'failed' || result.status === 'cancelled') {
                    clearInterval(pollIntervalId);
                    clearTimeout(timeoutId);
                    hideWaitingModal();
                    showToast(`Payment failed: ${result.message}`);
                    fetchAndRenderAllOrders();
                }
            } catch (error) {
                clearInterval(pollIntervalId);
                clearTimeout(timeoutId);
                hideWaitingModal();
                showToast("Error checking payment status.");
                fetchAndRenderAllOrders();
            }
        }, POLLING_INTERVAL);
    }

    // --- Handle Button Clicks using Event Delegation ---
    mainContent.addEventListener('click', async (event) => {
        const target = event.target;

        // --- Handle "Pay Now" Button Click ---
        if (target.classList.contains('pay-now-btn')) {
            const button = target;
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
                button.disabled = false;
                button.innerHTML = 'Pay Now';
            }
        }

        // --- Handle "View Details" Button Click ---
        if (target.classList.contains('view-details-btn')) {
            const orderId = target.dataset.orderId;
            const clickedOrder = allUserOrders.find(o => o.id === orderId);
            if (clickedOrder) {
                populateAndShowModal(clickedOrder);
            } else {
                console.warn('Could not find order with ID:', orderId);
                showToast('Could not load order details.');
            }
        }
    });

    if (cancelOrderBtn) {
        cancelOrderBtn.addEventListener('click', async () => {
            const orderId = cancelOrderBtn.dataset.orderId;
            if (!orderId) {
                showToast("Error: Could not find Order ID to cancel.");
                return;
            }
            showCustomConfirm("Are you sure you want to cancel this order? This action cannot be undone.", orderId);
        });
    }


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
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ orderId: orderId, source: 'paid' }),
                });
                if (!response.ok) {
                    const err = await response.json();
                    throw new Error(err.error || 'Receipt generation failed.');
                }
                const blob = await response.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.style.display = 'none';
                a.href = url;
                const disposition = response.headers.get('content-disposition');
                let filename = 'receipt.pdf';
                if (disposition && disposition.includes('attachment')) {
                    const filenameMatch = /filename="([^"]+)"/.exec(disposition);
                    if (filenameMatch && filenameMatch[1]) filename = filenameMatch[1];
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

    if(continueShoppingButton) {
        continueShoppingButton.addEventListener('click', closeConfirmation);
    }

    // --- Logic for the Order Details Modal ---
    function populateAndShowModal(order) {
        if (!order) return;

        document.getElementById('modalOrderNumber').textContent = order.order_number || 'N/A';
        document.getElementById('modalOrderDate').textContent = new Date(order.created_at).toLocaleString('en-KE', { dateStyle: 'medium', timeStyle: 'short' });
        document.getElementById('modalMpesaCode').textContent = order.mpesa_receipt_number || 'N/A';
        document.getElementById('modalOrderTotal').textContent = `KSh ${order.total.toLocaleString()}`;
        
        const statusEl = document.getElementById('modalOrderStatus');
        const statusText = order.payment_status || 'unpaid';
        statusEl.textContent = statusText.charAt(0).toUpperCase() + statusText.slice(1);
        statusEl.className = statusText === 'paid' ? 'font-bold text-green-600' : 'font-bold text-yellow-600';

        if (statusText === 'unpaid') {
            cancelOrderBtn.classList.remove('hidden');
            cancelOrderBtn.dataset.orderId = order.id;
        } else {
            cancelOrderBtn.classList.add('hidden');
        }

        const itemsContainer = document.getElementById('modalOrderItems');
        itemsContainer.innerHTML = '';
        
        const orderItems = Array.isArray(order.items) ? order.items : [];
        
        orderItems.forEach(item => {
            const itemDiv = document.createElement('div');
            itemDiv.className = 'flex justify-between items-center text-sm py-1 border-b';
            itemDiv.innerHTML = `
                <span class="pr-4">${item.name} (x${item.quantity})</span>
                <span class="text-gray-600 font-mono">KSh ${(item.price * item.quantity).toLocaleString()}</span>
            `;
            itemsContainer.appendChild(itemDiv);
        });

        orderDetailsModal.classList.remove('hidden');
        overlay.classList.remove('hidden');
        document.body.classList.add('overflow-hidden');
    }

    if (closeOrderDetailsModal) {
        closeOrderDetailsModal.addEventListener('click', () => {
            orderDetailsModal.classList.add('hidden');
            overlay.classList.add('hidden');
            document.body.classList.remove('overflow-hidden');
        });
    }

    // --- Mobile Menu Toggle Logic ---
    function toggleMobileMenu() {
        const isActive = mobileMenu.classList.contains('is-active');
        if (isActive) {
            mobileMenu.classList.remove('is-active');
            if (orderDetailsModal.classList.contains('hidden')) {
               overlay.classList.add('hidden');
               document.body.style.overflow = '';
            }
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
            if (mobileMenu.classList.contains('is-active')) toggleMobileMenu();
            if (!orderDetailsModal.classList.contains('hidden')) {
                orderDetailsModal.classList.add('hidden');
                overlay.classList.add('hidden');
                document.body.classList.remove('overflow-hidden');
            }
        });
    }

    function showCustomConfirm(message, orderId) {
        const confirmModalMessage = document.getElementById('confirmModalMessage');
        if (confirmModalMessage) {
            confirmModalMessage.textContent = message;
        }
        customConfirmModal.classList.remove('hidden');
        overlay.classList.remove('hidden');

        confirmModalOkBtn.onclick = async () => {
            try {
                const idToken = await auth.currentUser.getIdToken();
                const response = await fetch('/.netlify/functions/cancel-order', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${idToken}`
                    },
                    body: JSON.stringify({ orderId: orderId })
                });

                if (!response.ok) {
                    const err = await response.json();
                    throw new Error(err.error || 'Failed to cancel order.');
                }

                showToast("Order cancelled successfully.");
                closeOrderDetailsModal.click(); // Close the modal
                fetchAndRenderAllOrders(); // Refresh the lists
            } catch (error) {
                console.error("Error cancelling order:", error);
                showToast(`Error: ${error.message}`);
            } finally {
                hideCustomConfirm();
            }
        };

        confirmModalCancelBtn.onclick = () => {
            hideCustomConfirm();
        };
    }

    function hideCustomConfirm() {
        customConfirmModal.classList.add('hidden');
        if (orderDetailsModal.classList.contains('hidden')) {
            overlay.classList.add('hidden');
        }
    }

    // --- Combined function to fetch and render all orders ---
    async function fetchAndRenderAllOrders() {
        const unpaidOrders = await fetchUnpaidOrders();
        const paidOrders = await fetchPaidOrders();
        allUserOrders = [...unpaidOrders, ...paidOrders];
    }
    
    // --- Initial Data Fetch ---
    fetchAndRenderAllOrders();
});

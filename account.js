// account.js
// This script handles the logic for the "My Account" page.
// It fetches and displays unpaid orders and paid order history from Supabase.
// It now includes logic to handle QR code scans for receipt verification.
//......

import { supabase } from './supabase-config.js';
import { auth } from './firebase-config.js';
import { getCurrentUserWithRole, logout } from './auth.js';
import { showToast, showAlertModal, closeConfirmation } from './uiUpdater.js';

document.addEventListener('DOMContentLoaded', async () => {
    let allUserOrders = []; 
    let currentUser = null;

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

    // --- Authentication Check ---
    auth.onAuthStateChanged(async (user) => {
        if (!user) {
            // If no user is logged in, check for a QR code scan
            await handleQRCodeScan();
            loader.style.display = 'none';
            mainContent.classList.remove('hidden');
            userProfileSection.classList.add('hidden'); // Hide profile section
        } else {
            currentUser = user;
            loader.style.display = 'none';
            mainContent.classList.remove('hidden');
            displayUserProfile(currentUser);
            await fetchAndRenderAllOrders();
            // After fetching orders, check for a QR scan
            await handleQRCodeScan();
        }
    });

    // --- Display User Profile ---
    function displayUserProfile(user) {
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
    }

    // --- Fetch Functions ---
    async function fetchUnpaidOrders() {
        if (!unpaidOrdersGrid || !currentUser) return [];
        const { data: orders, error } = await supabase.from('unpaid_orders').select('*').eq('user_id', currentUser.uid).order('created_at', { ascending: false });
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
        if (!paidOrdersGrid || !currentUser) return [];
        const { data: orders, error } = await supabase.from('paid_orders').select('*').eq('user_id', currentUser.uid).order('created_at', { ascending: false });
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
        card.className = 'bg-white p-4 rounded-lg shadow-md flex flex-col md:flex-row justify-between items-start md:items-center';
        card.dataset.orderId = order.id;

        const orderDate = order.created_at ? new Date(order.created_at).toLocaleDateString() : 'N/A';
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
        card.className = 'bg-white p-4 rounded-lg shadow-md flex flex-col md:flex-row justify-between items-start md:items-center';
        card.dataset.orderId = order.id;

        const orderDate = order.created_at ? new Date(order.created_at).toLocaleDateString() : 'N/A';
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
    
    // --- Handle Button Clicks using Event Delegation ---
    mainContent.addEventListener('click', async (event) => {
        const target = event.target;

        if (target.classList.contains('pay-now-btn')) {
            const orderId = target.dataset.orderId;
            const orderToPay = allUserOrders.find(o => o.id === orderId && o.payment_status === 'unpaid');

            if (orderToPay) {
                sessionStorage.setItem('checkoutOrder', JSON.stringify(orderToPay));
                window.location.href = 'checkout.html';
            } else {
                showAlertModal("Could not find the order to pay.", "Error", "error");
            }
        }

        if (target.classList.contains('view-details-btn')) {
            const orderId = target.dataset.orderId;
            const clickedOrder = allUserOrders.find(o => o.id === orderId);
            if (clickedOrder) {
                populateAndShowModal(clickedOrder);
            } else {
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
            // Logic to download receipt from confirmation modal
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

    // --- QR CODE SCAN HANDLING LOGIC ---
    async function handleQRCodeScan() {
        const params = new URLSearchParams(window.location.search);
        const orderNumberFromURL = params.get('order');

        if (!orderNumberFromURL) {
            return; // No scan detected, do nothing.
        }

        // Clean the URL to remove the query parameter for a cleaner user experience
        history.replaceState(null, '', window.location.pathname);

        // Scenario 1: User is logged in
        if (currentUser) {
            const matchingOrder = allUserOrders.find(o => o.order_number === orderNumberFromURL);
            if (matchingOrder) {
                // The logged-in user owns this order, show the details immediately.
                populateAndShowModal(matchingOrder);
                return;
            }
        }

        // Scenario 2: User is a guest, or not the owner of the order.
        // We must verify the receipt's genuineness publicly.
        try {
            const response = await fetch('/.netlify/functions/verify-receipt', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ orderNumber: orderNumberFromURL }),
            });
            const result = await response.json();

            if (result.genuine) {
                showAlertModal(
                    `This is a genuine receipt for order #${orderNumberFromURL}. Please log in to the account that placed the order to view full details.`,
                    "Receipt Verified",
                    "success"
                );
            } else {
                showAlertModal(
                    `The receipt for order #${orderNumberFromURL} could not be found in our records. It may be invalid.`,
                    "Verification Failed",
                    "error"
                );
            }
        } catch (error) {
            console.error("Error verifying receipt:", error);
            showAlertModal("An error occurred while trying to verify the receipt.", "Error", "error");
        }
    }

    // --- Other Functions (Mobile Menu, Confirmation Modals etc.) ---
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
                closeOrderDetailsModal.click();
                fetchAndRenderAllOrders();
            } catch (error) {
                showAlertModal(`Error: ${error.message}`, "Error", "error");
            } finally {
                hideCustomConfirm();
            }
        };
        confirmModalCancelBtn.onclick = hideCustomConfirm;
    }

    function hideCustomConfirm() {
        customConfirmModal.classList.add('hidden');
        if (orderDetailsModal.classList.contains('hidden')) {
            overlay.classList.add('hidden');
        }
    }

    async function fetchAndRenderAllOrders() {
        if (!currentUser) return;
        const unpaidOrders = await fetchUnpaidOrders();
        const paidOrders = await fetchPaidOrders();
        allUserOrders = [...unpaidOrders, ...paidOrders];
    }
});

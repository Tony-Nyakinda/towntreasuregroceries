// account.js
// This script handles the logic for the "My Account" page.
// It fetches and displays unpaid orders and paid order history from Supabase.
// It now handles M-Pesa payments for pending orders directly from this page.

import { supabase } from './supabase-config.js';
import { auth } from './firebase-config.js';
import { getCurrentUserWithRole, logout } from './auth.js';
import { showToast, showWaitingModal, hideWaitingModal, showConfirmation, closeConfirmation, showAlertModal } from './uiUpdater.js';
import { getDeliveryFee } from './delivery-zones.js';

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
            await handleQRCodeScan();
            loader.style.display = 'none';
            mainContent.classList.remove('hidden');
            userProfileSection.classList.add('hidden');
        } else {
            currentUser = user;
            loader.style.display = 'none';
            mainContent.classList.remove('hidden');
            displayUserProfile(currentUser);
            await fetchAndRenderAllOrders();
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
                // Directly initiate payment from the account page
                await handleMpesaPayment(orderToPay);
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

    // --- M-PESA PAYMENT LOGIC (ADAPTED FOR ACCOUNT PAGE) ---
    async function handleMpesaPayment(order) {
        const orderDetails = {
            orderNumber: order.order_number,
            userId: order.user_id,
            fullName: order.full_name,
            phone: order.phone,
            address: order.address,
            items: order.items,
            total: order.total,
            deliveryFee: order.delivery_fee
        };

        try {
            const functionUrl = "/.netlify/functions/mpesa/initiateMpesaPayment";
            const response = await fetch(functionUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    phone: orderDetails.phone, 
                    amount: orderDetails.total, 
                    orderDetails,
                    unpaidOrderId: order.id // Pass the unpaid order ID to be deleted on success
                }),
            });

            const result = await response.json();
            if (!response.ok) throw new Error(result.error || 'M-Pesa API request failed.');
            
            waitForPaymentConfirmation(result.checkoutRequestID);

        } catch (error) {
            console.error("M-Pesa Error:", error);
            showAlertModal(error.message, "Payment Error", "error");
        }
    }

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
                    await fetchAndRenderAllOrders(); // Refresh the order lists
                    showConfirmation(result.finalOrder.order_number, result.finalOrder);
                } else if (result.status === 'failed' || result.status === 'cancelled') {
                    clearInterval(pollIntervalId);
                    clearTimeout(timeoutId);
                    hideWaitingModal();
                    showAlertModal(`Your payment was not completed: ${result.message || 'The transaction was cancelled.'}. Please try again.`, "Payment Unsuccessful", "error");
                }
            } catch (error) {
                clearInterval(pollIntervalId);
                clearTimeout(timeoutId);
                hideWaitingModal();
                showAlertModal(`An error occurred while checking payment status: ${error.message}`, "Error", "error");
            }
        }, POLLING_INTERVAL);
    }

    // --- MODAL AND UI LOGIC ---
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
            itemDiv.className = 'flex justify-between items-center text-sm py-2 border-b';
            let itemHTML = `
                <div class="flex-grow">
                    <p>${item.name}</p>
                    <p class="text-xs text-gray-500">${item.quantity} x KSh ${item.price.toLocaleString()}</p>
                </div>
                <div class="flex items-center">
                    <span class="text-gray-800 font-mono mr-4">KSh ${(item.price * item.quantity).toLocaleString()}</span>
            `;

            if (statusText === 'unpaid') {
                itemHTML += `<button class="delete-item-btn text-red-400 hover:text-red-600 transition-colors duration-200" data-item-id="${item.id}" data-order-id="${order.id}" title="Remove Item">
                                <i class="fas fa-trash-alt"></i>
                             </button>`;
            }

            itemHTML += `</div>`;
            itemDiv.innerHTML = itemHTML;
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
            return; 
        }

        history.replaceState(null, '', window.location.pathname);

        if (currentUser) {
            const matchingOrder = allUserOrders.find(o => o.order_number === orderNumberFromURL);
            if (matchingOrder) {
                populateAndShowModal(matchingOrder);
                return;
            }
        }

        try {
            const response = await fetch('/.netlify/functions/verify-receipt', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ orderNumber: orderNumberFromURL }),
            });
            const result = await response.json();

            if (result.genuine) {
                const alertModalCloseButton = document.getElementById('alertModalCloseButton');
                overlay.classList.remove('bg-black', 'bg-opacity-50');
                overlay.classList.add('bg-white');

                const handleRedirect = () => {
                    overlay.classList.add('bg-black', 'bg-opacity-50');
                    overlay.classList.remove('bg-white');
                    window.location.href = 'login.html';
                    alertModalCloseButton.removeEventListener('click', handleRedirect);
                };
                
                alertModalCloseButton.addEventListener('click', handleRedirect, { once: true });

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
            if (mobileMenu.classList.contains('is-active')) {
                toggleMobileMenu();
            }
            if (!orderDetailsModal.classList.contains('hidden')) {
                orderDetailsModal.classList.add('hidden');
                overlay.classList.add('hidden');
                document.body.classList.remove('overflow-hidden');
            }
        });
    }

    // --- Item Deletion Logic ---
    orderDetailsModal.addEventListener('click', async (event) => {
        const target = event.target.closest('.delete-item-btn');
        if (!target) return;

        const itemId = target.dataset.itemId;
        const orderId = target.dataset.orderId;

        const orderToUpdate = allUserOrders.find(o => o.id === orderId);
        if (!orderToUpdate) {
            showAlertModal("Could not find the order to update.", "Error", "error");
            return;
        }

        const newItems = orderToUpdate.items.filter(item => item.id.toString() !== itemId.toString());

        if (newItems.length === 0) {
            showCustomConfirm("Deleting the last item will cancel the entire order. Are you sure?", orderId);
            return;
        }

        const newSubtotal = newItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
        const deliveryFee = getDeliveryFee(orderToUpdate.address);
        const newTotal = newSubtotal + deliveryFee;

        const { error } = await supabase
            .from('unpaid_orders')
            .update({ items: newItems, total: newTotal, delivery_fee: deliveryFee })
            .eq('id', orderId);

        if (error) {
            showAlertModal(`Failed to update order: ${error.message}`, "Error", "error");
            return;
        }
        
        const updatedOrder = {
            ...orderToUpdate,
            items: newItems,
            total: newTotal,
            delivery_fee: deliveryFee
        };

        showToast("Item removed successfully.");
        const orderIndex = allUserOrders.findIndex(o => o.id === orderId);
        if (orderIndex !== -1) {
            allUserOrders[orderIndex] = updatedOrder;
        }
        
        populateAndShowModal(updatedOrder);
        await fetchAndRenderAllOrders();
    });

    // --- Confirmation Modal Logic ---
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

    // --- Initial Data Fetch ---
    async function fetchAndRenderAllOrders() {
        if (!currentUser) return;
        const unpaidOrders = await fetchUnpaidOrders();
        const paidOrders = await fetchPaidOrders();
        allUserOrders = [...unpaidOrders, ...paidOrders];
    }
});

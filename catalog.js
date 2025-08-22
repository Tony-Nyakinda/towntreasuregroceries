// catalog.js
// This script handles dynamic content for the catalog page,
// including product display, category filtering, search, sorting, and pagination.
// UPDATED to handle M-Pesa payment status by polling a Netlify Function instead of Firestore.
import { supabase } from './supabase-config.js'; // Import Supabase instance
import { getProducts } from './productsData.js'; // Correctly import getProducts function
import { showToast, toggleCart, checkout, closeCheckout, showConfirmation, closeConfirmation, updateCartUI, showWaitingModal, hideWaitingModal } from './uiUpdater.js'; // AMENDMENT: Import waiting modal functions
import { addToCart, updateCartItemQuantity, removeFromCart, getCart, clearCart } from './cartManager.js'; // Import cart management functions
import { getCurrentUserWithRole, logout } from './auth.js'; // Import auth functions for user login/logout logic

// Import Firebase modules for database interaction
import { db, auth } from './firebase-config.js'; // Import db and auth instances

// DOM Elements - Catalog Specific
const productGrid = document.getElementById('productGrid');
const categoryTabsContainer = document.querySelector('.flex-wrap.justify-center.gap-3');
const searchInput = document.getElementById('searchInput');
const sortSelect = document.getElementById('sortSelect');
const noResultsMessage = document.getElementById('noResults');
const paginationContainer = document.getElementById('pagination'); // Parent container for pagination buttons
const currentPageSpan = document.getElementById('currentPage'); // Span to display current page number

// --- AMENDMENT: Add reference to the download receipt button ---
const downloadReceiptBtn = document.getElementById('downloadReceiptBtn');

// DOM Elements - Checkout/Confirmation Modals (can be present on multiple pages)
const checkoutForm = document.getElementById('checkoutForm');
const fullNameInput = document.getElementById('fullName');
const phoneInput = document.getElementById('phone');
const addressInput = document.getElementById('address');
const instructionsInput = document.getElementById('instructions');
const paymentMethodRadios = document.querySelectorAll('input[name="paymentMethod"]');
const mpesaPaymentDiv = document.getElementById('mpesaPayment');
const deliveryPaymentDiv = document.getElementById('deliveryPayment');
const orderNumberSpan = document.getElementById('orderNumber');
const confirmationMessage = document.getElementById('confirmationMessage');
const proceedToCheckoutBtn = document.getElementById('proceedToCheckoutBtn');

// DOM Elements - Navigation and User Profile (for mobile sidebar logic)
const loginLink = document.getElementById('loginLink');
const userProfileButton = document.getElementById('userProfileButton');
const userProfilePic = document.getElementById('userProfilePic');
const userInitials = document.getElementById('userInitials');
const userNameDisplay = document.getElementById('userNameDisplay');
const userProfileDropdownContainer = document.getElementById('userProfileDropdownContainer'); // Parent for desktop dropdown
const userDropdownMenu = document.getElementById('userDropdownMenu');
const dropdownUserName = document.getElementById('dropdownUserName');
const dropdownUserEmail = document.getElementById('dropdownUserEmail');
const logoutDropdownButton = document.getElementById('logoutDropdownButton');
const adminLink = document.getElementById('adminLink');

const mobileLoginLink = document.getElementById('mobileLoginLink');
const mobileUserProfileButton = document.getElementById('mobileUserProfileButton');
const mobileUserProfilePic = document.getElementById('mobileUserProfilePic');
const mobileUserInitials = document.getElementById('mobileUserInitials');
const mobileUserNameDisplay = document.getElementById('mobileUserNameDisplay');
const mobileUserDropdownMenu = document.getElementById('mobileUserDropdownMenu');
const mobileDropdownUserName = document.getElementById('mobileDropdownUserName');
const mobileDropdownUserEmail = document.getElementById('mobileDropdownUserEmail');
const mobileLogoutButton = document.getElementById('mobileLogoutButton');
const mobileAdminLink = document.getElementById('mobileAdminLink');

const mobileMenuButton = document.getElementById('mobileMenuButton');
const mobileMenu = document.getElementById('mobileMenu');
const closeMobileMenuButton = document.getElementById('closeMobileMenuButton');

const PRODUCTS_PER_PAGE = 8;
let allProductsFlat = [];
let currentCategory = 'all';
let currentPage = 1;

const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';

/**
 * Renders products into the product grid based on the current filters and pagination.
 */
function renderProducts(productsToDisplay) {
    if (!productGrid) return;
    productGrid.innerHTML = '';

    if (productsToDisplay.length === 0) {
        if (noResultsMessage) noResultsMessage.classList.remove('hidden');
        return;
    } else {
        if (noResultsMessage) noResultsMessage.classList.add('hidden');
    }

    productsToDisplay.forEach(product => {
        const productCard = document.createElement('div');
        productCard.classList.add('product-card');
        productCard.innerHTML = `
            <div class="product-card-inner bg-white rounded-lg overflow-hidden shadow-md">
                <div class="product-image-container">
                    <img src="${product.image || 'https://placehold.co/400x300/e2e8f0/4a5568?text=No+Image'}" alt="${product.name}" class="product-image">
                </div>
                <div class="p-4 flex-grow flex flex-col">
                    <h3 class="product-name">${product.name}</h3>
                    <p class="text-gray-600 text-sm mb-2">${product.category}</p>
                    <div class="flex items-center justify-between mt-auto">
                        <span class="product-price">KSh ${product.price.toLocaleString()}</span>
                        <span class="text-gray-500 text-sm">/${product.unit}</span>
                    </div>
                    <button class="add-to-cart-btn mt-4 bg-green-500 text-white py-2 px-4 rounded-md hover:bg-green-600 transition duration-300" data-product-id="${product.id}">
                        Add to Cart
                    </button>
                </div>
            </div>
        `;
        productGrid.appendChild(productCard);
    });

    productGrid.querySelectorAll('.add-to-cart-btn').forEach(button => {
        button.addEventListener('click', (e) => {
            const productId = e.target.dataset.productId;
            addToCart(productId);
        });
    });
}

/**
 * Filters and sorts products based on the current category, search term, and sort order.
 */
async function filterAndRenderProducts() {
    if (!productGrid) return;

    const allProducts = await getProducts();
    allProductsFlat = allProducts.all || [];

    let filteredProducts = allProductsFlat;

    if (currentCategory !== 'all') {
        filteredProducts = filteredProducts.filter(product => product.category === currentCategory);
    }

    const searchTerm = searchInput ? searchInput.value.toLowerCase() : '';
    if (searchTerm) {
        filteredProducts = filteredProducts.filter(product =>
            product.name.toLowerCase().includes(searchTerm) ||
            product.category.toLowerCase().includes(searchTerm)
        );
    }

    const sortOrder = sortSelect ? sortSelect.value : 'default';
    if (sortOrder === 'price-asc') {
        filteredProducts.sort((a, b) => a.price - b.price);
    } else if (sortOrder === 'price-desc') {
        filteredProducts.sort((a, b) => b.price - a.price);
    } else if (sortOrder === 'name-asc') {
        filteredProducts.sort((a, b) => a.name.localeCompare(b.name));
    } else if (sortOrder === 'name-desc') {
        filteredProducts.sort((a, b) => b.name.localeCompare(a.name));
    }

    const totalPages = Math.ceil(filteredProducts.length / PRODUCTS_PER_PAGE);
    if (currentPage > totalPages && totalPages > 0) {
        currentPage = totalPages;
    } else if (totalPages === 0) {
        currentPage = 1;
    }

    const startIndex = (currentPage - 1) * PRODUCTS_PER_PAGE;
    const endIndex = startIndex + PRODUCTS_PER_PAGE;
    const productsOnPage = filteredProducts.slice(startIndex, endIndex);

    renderProducts(productsOnPage);
    updatePaginationControls(totalPages);
}

/**
 * Creates a pagination button element.
 */
function createPaginationButton(text, pageNumber, action, isActive = false, isDisabled = false) {
    const button = document.createElement('button');
    button.textContent = text;
    button.classList.add('pagination-btn', 'px-4', 'py-2', 'rounded-md', 'transition', 'duration-200');

    if (action) button.dataset.action = action;
    if (pageNumber) button.dataset.page = pageNumber;

    if (isActive) {
        button.classList.add('bg-green-600', 'text-white', 'hover:bg-green-700');
    } else {
        button.classList.add('bg-gray-200', 'text-gray-700', 'hover:bg-gray-300');
    }

    if (isDisabled) {
        button.classList.add('opacity-50', 'cursor-not-allowed');
        button.disabled = true;
    }

    if (typeof text === 'number' || (typeof text === 'string' && !isNaN(parseInt(text)))) {
        button.classList.add('w-10', 'h-10', 'flex', 'items-center', 'justify-center', 'mx-1');
    }

    return button;
}

/**
 * Updates the pagination controls.
 */
function updatePaginationControls(totalPages) {
    if (!paginationContainer || !currentPageSpan) return;

    paginationContainer.innerHTML = '';
    if (totalPages <= 1) {
        paginationContainer.classList.add('hidden');
        return;
    } else {
        paginationContainer.classList.remove('hidden');
    }

    paginationContainer.appendChild(createPaginationButton('Previous', null, 'prev', false, currentPage === 1));

    const maxVisiblePages = 5;
    const boundaryPages = 1;
    let pages = [];

    if (totalPages <= maxVisiblePages + 2 * boundaryPages) {
        for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
        pages.push(1);
        let startPage = Math.max(2, currentPage - Math.floor(maxVisiblePages / 2));
        let endPage = Math.min(totalPages - 1, currentPage + Math.floor(maxVisiblePages / 2));

        if (currentPage <= boundaryPages + Math.floor(maxVisiblePages / 2)) endPage = maxVisiblePages;
        if (currentPage >= totalPages - boundaryPages - Math.floor(maxVisiblePages / 2)) startPage = totalPages - maxVisiblePages + 1;

        if (startPage > 2) pages.push('...');
        for (let i = startPage; i <= endPage; i++) pages.push(i);
        if (endPage < totalPages - 1) pages.push('...');
        if (!pages.includes(totalPages)) pages.push(totalPages);
    }

    pages.forEach(page => {
        if (page === '...') {
            const ellipsisSpan = document.createElement('span');
            ellipsisSpan.textContent = '...';
            ellipsisSpan.classList.add('text-gray-700', 'font-bold', 'mx-1', 'px-2', 'py-2');
            paginationContainer.appendChild(ellipsisSpan);
        } else {
            paginationContainer.appendChild(createPaginationButton(page, page, null, page === currentPage));
        }
    });

    paginationContainer.appendChild(createPaginationButton('Next', null, 'next', false, currentPage === totalPages));
    currentPageSpan.textContent = currentPage;
}

/**
 * Handles category tab clicks.
 */
function selectCategory(category) {
    if (!categoryTabsContainer) return;
    currentCategory = category;
    currentPage = 1;
    filterAndRenderProducts();
    categoryTabsContainer.querySelectorAll('.category-tab').forEach(tab => {
        if (tab.dataset.category === category) {
            tab.classList.add('bg-green-600', 'text-white', 'active');
            tab.classList.remove('bg-gray-200', 'text-gray-700');
        } else {
            tab.classList.remove('bg-green-600', 'text-white', 'active');
            tab.classList.add('bg-gray-200', 'text-gray-700');
        }
    });
    updateUrlParams({ category: category, page: 1 });
}

/**
 * Updates URL query parameters.
 */
function updateUrlParams(params) {
    const url = new URL(window.location);
    for (const key in params) {
        url.searchParams.set(key, params[key]);
    }
    window.history.pushState({}, '', url);
}

/**
 * Reads category and page from URL and applies filters.
 */
async function handleCategoryAndPageFromUrl() {
    const urlParams = new URLSearchParams(window.location.search);
    const categoryFromUrl = urlParams.get('category');
    const pageFromUrl = parseInt(urlParams.get('page')) || 1;

    if (productGrid) {
        if (allProductsFlat.length === 0) {
            try {
                const fetchedProducts = await getProducts();
                allProductsFlat = fetchedProducts.all;
            } catch (error) {
                console.error("Error fetching products for URL params:", error);
                return;
            }
        }
        const availableCategories = new Set(allProductsFlat.map(p => p.category));
        currentCategory = categoryFromUrl && availableCategories.has(categoryFromUrl) ? categoryFromUrl : 'all';
        currentPage = pageFromUrl;

        if (categoryTabsContainer) selectCategory(currentCategory);
        await filterAndRenderProducts();
    }
}

/**
 * Polls for M-Pesa payment confirmation.
 */
function waitForPaymentConfirmation(checkoutRequestID) {
    const pollUrl = "https://towntreasuregroceries.netlify.app/.netlify/functions/mpesa/getPaymentStatus";
    const POLLING_INTERVAL = 3000;
    const TIMEOUT_DURATION = 90000;

    let pollIntervalId = null;
    let timeoutId = null;

    timeoutId = setTimeout(() => {
        clearInterval(pollIntervalId);
        hideWaitingModal();
        showToast("Payment timed out. Please try again or check your M-Pesa account.");
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
                showToast(`Payment failed: ${result.message}`);
            }
        } catch (error) {
            console.error("Error during polling for payment status:", error);
            clearInterval(pollIntervalId);
            clearTimeout(timeoutId);
            hideWaitingModal();
            showToast("Error checking payment status. Please check your M-Pesa account.");
        }
    }, POLLING_INTERVAL);
}

// --- Event Listeners ---
if (categoryTabsContainer) {
    categoryTabsContainer.addEventListener('click', (event) => {
        const targetTab = event.target.closest('.category-tab');
        if (targetTab) {
            const category = targetTab.dataset.category;
            selectCategory(category);
        }
    });
}

if (searchInput) {
    searchInput.addEventListener('input', () => {
        currentPage = 1;
        filterAndRenderProducts();
        updateUrlParams({ search: searchInput.value, page: currentPage, category: currentCategory, sort: sortSelect?.value || '' });
    });
}

if (sortSelect) {
    sortSelect.addEventListener('change', () => {
        currentPage = 1;
        filterAndRenderProducts();
        updateUrlParams({ sort: sortSelect.value, page: currentPage, category: currentCategory, search: searchInput?.value || '' });
    });
}

if (proceedToCheckoutBtn) {
    proceedToCheckoutBtn.addEventListener('click', () => {
        if (!auth.currentUser) {
            showToast("Please log in to proceed to checkout.");
            setTimeout(() => {
                window.location.href = 'login.html';
            }, 1500);
            return;
        }
        checkout();
    });
}

if (checkoutForm) {
    checkoutForm.addEventListener('submit', async function(event) {
        event.preventDefault();
        const placeOrderBtn = this.querySelector('button[type="submit"]');
        placeOrderBtn.disabled = true;
        placeOrderBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...';

        if (!auth.currentUser) {
            showToast("You must be logged in to place an order. Redirecting to login...");
            setTimeout(() => { window.location.href = 'login.html'; }, 2000);
            return;
        }

        const customerName = fullNameInput ? fullNameInput.value : '';
        const customerPhone = phoneInput ? phoneInput.value : '';
        const customerAddress = addressInput ? addressInput.value : '';
        const deliveryInstructions = instructionsInput ? instructionsInput.value : '';
        const customerEmail = auth.currentUser.email;
        const selectedPaymentMethod = document.querySelector('input[name="paymentMethod"]:checked').value;
        const tempOrderNum = `TTG-${Date.now().toString().slice(-6)}`;
        const currentCart = getCart();
        const productsData = await getProducts();
        const allProds = Array.isArray(productsData.all) ? productsData.all : [];
        const productsMap = {};
        allProds.forEach(p => { productsMap[p.id] = p; });

        const enrichedCartItems = currentCart.map(item => {
            const productDetails = productsMap[item.id];
            return {
                ...item,
                name: productDetails ? productDetails.name : 'Unknown Product',
                price: productDetails ? productDetails.price : 0,
                unit: productDetails ? productDetails.unit : ''
            };
        });

        const subtotal = enrichedCartItems.reduce((acc, item) => acc + (item.price * item.quantity), 0);
        const total = subtotal; // Assuming DELIVERY_FEE is 0 or handled elsewhere
        const userId = auth.currentUser.uid;

        const orderDetails = {
            orderNumber: tempOrderNum,
            userId,
            fullName: customerName,
            phone: customerPhone,
            email: customerEmail,
            address: customerAddress,
            instructions: deliveryInstructions,
            items: enrichedCartItems,
            total,
            paymentMethod: selectedPaymentMethod,
            paymentStatus: 'pending',
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        };

        if (selectedPaymentMethod === 'mpesa') {
            try {
                const functionUrl = "https://towntreasuregroceries.netlify.app/.netlify/functions/mpesa/initiateMpesaPayment";
                const mpesaResponse = await fetch(functionUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ phone: customerPhone, amount: total, orderDetails }),
                });
                const mpesaResult = await mpesaResponse.json();
                if (!mpesaResponse.ok) throw new Error(mpesaResult.error || 'M-Pesa API request failed.');
                closeCheckout();
                showWaitingModal();
                waitForPaymentConfirmation(mpesaResult.checkoutRequestID);
            } catch (error) {
                console.error("Error during M-Pesa checkout:", error);
                showToast(`Checkout failed: ${error.message}. Please try again.`);
            } finally {
                placeOrderBtn.disabled = false;
                placeOrderBtn.innerHTML = 'Place Order';
            }
        } else if (selectedPaymentMethod === 'delivery') {
            try {
                const { error } = await supabase.from('unpaid_orders').insert([{
                    order_number: orderDetails.orderNumber,
                    user_id: orderDetails.userId,
                    full_name: orderDetails.fullName,
                    phone: orderDetails.phone,
                    address: orderDetails.address,
                    items: orderDetails.items,
                    total: orderDetails.total,
                    payment_status: 'unpaid'
                }]);
                if (error) throw error;
                closeCheckout();
                if (confirmationMessage) confirmationMessage.textContent = "Your order has been placed successfully! Please have your payment ready for our delivery rider.";
                showConfirmation(tempOrderNum, orderDetails);
                clearCart();
                updateCartUI();
            } catch(error) {
                console.error("Error placing 'Pay on Delivery' order in Supabase:", error);
                showToast(`Order placement failed: ${error.message}. Please try again.`);
            } finally {
                placeOrderBtn.disabled = false;
                placeOrderBtn.innerHTML = 'Place Order';
            }
        }
    });
}

if (paymentMethodRadios) {
    paymentMethodRadios.forEach(radio => {
        radio.addEventListener('change', (event) => {
            mpesaPaymentDiv.classList.toggle('hidden', event.target.value !== 'mpesa');
            deliveryPaymentDiv.classList.toggle('hidden', event.target.value !== 'delivery');
        });
    });
}

if (paginationContainer) {
    paginationContainer.addEventListener('click', (event) => {
        const targetButton = event.target.closest('.pagination-btn');
        if (targetButton && !targetButton.disabled) {
            const action = targetButton.dataset.action;
            const page = parseInt(targetButton.dataset.page);
            if (action === 'prev') currentPage--;
            else if (action === 'next') currentPage++;
            else if (!isNaN(page)) currentPage = page;
            filterAndRenderProducts();
            updateUrlParams({ page: currentPage, category: currentCategory, search: searchInput?.value || '', sort: sortSelect?.value || '' });
        }
    });
}

// --- AMENDMENT: Added event listener for the receipt download button ---
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
                const err = await response.json().catch(() => ({ error: 'Receipt generation failed.' }));
                throw new Error(err.error);
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

function getInitials(name, email) {
    if (name && name.trim() !== '') {
        const parts = name.trim().split(' ');
        return parts.length > 1 ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase() : parts[0][0].toUpperCase();
    }
    return email && email.trim() !== '' ? email.trim()[0].toUpperCase() : '?';
}

function getFirstName(displayName, email) {
    if (displayName && displayName.trim() !== '') return displayName.trim().split(' ')[0];
    if (email && email.trim() !== '') return email.trim().split('@')[0];
    return 'User';
}

function toggleUserDropdown() {
    if (userDropdownMenu) {
        userDropdownMenu.classList.toggle('hidden');
        userDropdownMenu.classList.toggle('active');
    }
}

function toggleMobileMenu() {
    if (!mobileMenu) return;
    const isActive = mobileMenu.classList.contains('is-active');
    if (isActive) {
        mobileMenu.classList.remove('is-active');
        document.body.classList.remove('overflow-hidden');
    } else {
        mobileMenu.classList.add('is-active');
        document.body.classList.add('overflow-hidden');
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    await handleCategoryAndPageFromUrl();
    updateCartUI();

    const cartSidebar = document.getElementById('cartSidebar');
    if (cartSidebar) cartSidebar.classList.add('translate-x-full');

    const { user, role } = await getCurrentUserWithRole();

    if (user) {
        if (loginLink) loginLink.classList.add('hidden');
        if (userProfileButton) userProfileButton.classList.remove('hidden');

        const firstName = getFirstName(user.displayName, user.email);
        const userFullName = user.displayName || user.email;
        const userEmail = user.email;
        const photoURL = user.photoURL;

        if (userNameDisplay) userNameDisplay.textContent = firstName;
        if (dropdownUserName) dropdownUserName.textContent = userFullName;
        if (dropdownUserEmail) dropdownUserEmail.textContent = userEmail;

        if (photoURL) {
            if (userProfilePic) {
                userProfilePic.src = photoURL;
                userProfilePic.classList.remove('hidden');
            }
            if (userInitials) userInitials.classList.add('hidden');
        } else {
            if (userInitials) {
                userInitials.textContent = getInitials(user.displayName, user.email);
                userInitials.classList.remove('hidden');
            }
            if (userProfilePic) userProfilePic.classList.add('hidden');
        }

        if (userProfileButton) userProfileButton.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleUserDropdown();
        });

        document.addEventListener('click', (e) => {
            if (userProfileDropdownContainer && !userProfileDropdownContainer.contains(e.target)) {
                if (userDropdownMenu && userDropdownMenu.classList.contains('active')) {
                    toggleUserDropdown();
                }
            }
        });

        if (logoutDropdownButton) {
            logoutDropdownButton.addEventListener('click', async (e) => {
                e.preventDefault();
                await logout();
                window.location.reload();
            });
        }

        if (role === 'admin') {
            if (adminLink) adminLink.classList.remove('hidden');
        } else {
            if (adminLink) adminLink.classList.add('hidden');
        }

        if (mobileLoginLink) mobileLoginLink.classList.add('hidden');
        if (mobileLogoutButton) mobileLogoutButton.classList.remove('hidden');

        if (mobileDropdownUserName) mobileDropdownUserName.textContent = userFullName;
        if (mobileDropdownUserEmail) mobileDropdownUserEmail.textContent = userEmail;

        if (photoURL) {
            if (mobileUserProfilePic) {
                mobileUserProfilePic.src = photoURL;
                mobileUserProfilePic.classList.remove('hidden');
            }
            if (mobileUserInitials) mobileUserInitials.classList.add('hidden');
        } else {
            if (mobileUserInitials) {
                mobileUserInitials.textContent = getInitials(user.displayName, user.email);
                mobileUserInitials.classList.remove('hidden');
            }
            if (mobileUserProfilePic) mobileUserProfilePic.classList.add('hidden');
        }

        if (mobileLogoutButton) {
            mobileLogoutButton.addEventListener('click', async (e) => {
                e.preventDefault();
                await logout();
                window.location.reload();
            });
        }

        if (role === 'admin') {
            if (mobileAdminLink) mobileAdminLink.classList.remove('hidden');
        } else {
            if (mobileAdminLink) mobileAdminLink.classList.add('hidden');
        }

    } else {
        if (loginLink) loginLink.classList.remove('hidden');
        if (userProfileButton) userProfileButton.classList.add('hidden');
        if (userDropdownMenu) userDropdownMenu.classList.add('hidden');
        if (mobileLoginLink) mobileLoginLink.classList.remove('hidden');
        if (mobileLogoutButton) mobileLogoutButton.classList.add('hidden');
        if (adminLink) adminLink.classList.remove('hidden');
        if (mobileAdminLink) mobileAdminLink.classList.remove('hidden');
    }

    if (mobileMenuButton && mobileMenu && closeMobileMenuButton) {
        mobileMenuButton.addEventListener('click', toggleMobileMenu);
        closeMobileMenuButton.addEventListener('click', toggleMobileMenu);
        mobileMenu.addEventListener('click', (e) => {
            if (e.target === mobileMenu) toggleMobileMenu();
        });
    } else {
        console.warn("Mobile menu elements not found.");
    }
    
    const cartItemsContainer = document.getElementById('cartItems');
    if (cartItemsContainer) {
        cartItemsContainer.addEventListener('click', (e) => {
            const target = e.target.closest('button');
            if (!target) return;
            const productId = target.dataset.id;
            if (!productId) return;
            if (target.classList.contains('quantity-btn')) {
                const action = target.dataset.action;
                if (action === 'increase') window.updateCartItemQuantity(productId, 1);
                else if (action === 'decrease') window.updateCartItemQuantity(productId, -1);
            } else if (target.classList.contains('remove-item-btn')) {
                window.removeFromCart(productId);
            }
        });
    }
});

window.addEventListener('popstate', handleCategoryAndPageFromUrl);

// Expose functions globally so they can be called from HTML (onclick attributes)
window.toggleCart = toggleCart;
window.checkout = checkout;
window.closeCheckout = closeCheckout;
window.showConfirmation = showConfirmation;
window.closeConfirmation = closeConfirmation;
window.updateCartItemQuantity = updateCartItemQuantity;
window.removeFromCart = removeFromCart;
window.addToCart = addToCart;
window.clearCart = clearCart;
window.updateCartUI = updateCartUI;
window.showWaitingModal = showWaitingModal;
window.hideWaitingModal = hideWaitingModal;
window.showToast = showToast;
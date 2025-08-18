// eventListeners.js
// This file sets up all general event listeners for the page,
// relying on uiUpdater.js for UI interactions.

import { updateCartUI, showToast, toggleCart, checkout, closeCheckout, showConfirmation, closeConfirmation } from './uiUpdater.js';
import { auth } from './firebase-config.js'; // Import auth for logout

document.addEventListener('DOMContentLoaded', () => {
    // --- General UI Elements ---
    const mobileMenuButton = document.getElementById('mobileMenuButton');
    const mobileMenu = document.getElementById('mobileMenu');
    const contactForm = document.getElementById('contactForm');
    const overlay = document.getElementById('overlay');
    const loginLink = document.getElementById('loginLink');
    const mobileLoginLink = document.getElementById('mobileLoginLink');

    // --- Cart & Modal Buttons ---
    const mainCartButton = document.getElementById('mainCartButton');
    const fabCartButton = document.getElementById('fabCartButton');
    const closeCartButton = document.getElementById('closeCartButton');
    const mobileBottomCartButton = document.getElementById('mobileBottomCartButton');
    const startShoppingLink = document.getElementById('startShoppingLink');
    const closeCheckoutButton = document.getElementById('closeCheckoutButton');
    const continueShoppingButton = document.getElementById('continueShoppingButton');

    // --- Mobile Menu Toggle ---
    if (mobileMenuButton) {
        mobileMenuButton.addEventListener('click', () => {
            if (mobileMenu) mobileMenu.classList.toggle('hidden');
        });
    }
    
    // --- Cart Button Listeners ---
    if (mainCartButton) mainCartButton.addEventListener('click', toggleCart);
    if (fabCartButton) fabCartButton.addEventListener('click', toggleCart);
    if (closeCartButton) closeCartButton.addEventListener('click', toggleCart);
    if (startShoppingLink) startShoppingLink.addEventListener('click', toggleCart);
    if (mobileBottomCartButton) {
        mobileBottomCartButton.addEventListener('click', (e) => {
            e.preventDefault(); // Prevent default link behavior
            toggleCart();
        });
    }

    // --- Modal Button Listeners ---
    if (closeCheckoutButton) closeCheckoutButton.addEventListener('click', closeCheckout);
    if (continueShoppingButton) continueShoppingButton.addEventListener('click', closeConfirmation);

    // --- Overlay Listener (Combined Logic) ---
    if (overlay) {
        overlay.addEventListener('click', () => {
            const cartSidebar = document.getElementById('cartSidebar');
            const checkoutModal = document.getElementById('checkoutModal');
            const confirmationModal = document.getElementById('confirmationModal');

            if (cartSidebar && !cartSidebar.classList.contains('translate-x-full')) {
                toggleCart();
            }
            if (checkoutModal && !checkoutModal.classList.contains('hidden')) {
                closeCheckout();
            }
            if (confirmationModal && !confirmationModal.classList.contains('hidden')) {
                closeConfirmation();
            }
        });
    }

    // --- Contact Form Submission ---
    if (contactForm) {
        contactForm.addEventListener('submit', function(event) {
            event.preventDefault();
            showToast('Message sent successfully!');
            contactForm.reset();
        });
    }

    // --- Login/Logout Link Logic ---
    if (loginLink) {
        loginLink.addEventListener('click', async (e) => {
            if (loginLink.textContent === 'Logout') {
                e.preventDefault();
                try {
                    await auth.signOut();
                    console.log("User logged out.");
                    window.location.reload();
                } catch (error) {
                    console.error("Error logging out:", error);
                    showToast('Error logging out. Please try again.');
                }
            }
        });
    }

    if (mobileLoginLink) {
        mobileLoginLink.addEventListener('click', async (e) => {
            if (mobileLoginLink.textContent === 'Logout') {
                e.preventDefault();
                try {
                    await auth.signOut();
                    console.log("User logged out (mobile).");
                    window.location.reload();
                } catch (error) {
                    console.error("Error logging out (mobile):", error);
                    showToast('Error logging out. Please try again.');
                }
            }
        });
    }

    // --- Initial UI Update ---
    updateCartUI();
});

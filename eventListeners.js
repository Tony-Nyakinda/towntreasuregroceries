// eventListeners.js
// This file sets up all general event listeners for the page,
// relying on uiUpdater.js for UI interactions.

import { updateCartUI, showToast, toggleCart, checkout, closeCheckout, showConfirmation, closeConfirmation } from './uiUpdater.js';
import { auth } from './firebase-config.js'; // Import auth for logout
// Remove direct named import for signOut, as it's accessed via firebase.auth()
// import { signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth-compat.js"; // Import signOut

document.addEventListener('DOMContentLoaded', () => {
    // DOM elements
    const mobileMenuButton = document.getElementById('mobileMenuButton');
    const mobileMenu = document.getElementById('mobileMenu');
    const contactForm = document.getElementById('contactForm');
    const overlay = document.getElementById('overlay'); // Get overlay element
    const loginLink = document.getElementById('loginLink'); // Added for dynamic login/logout text
    const mobileLoginLink = document.getElementById('mobileLoginLink'); // Added for dynamic login/logout text

    // Mobile menu toggle
    if (mobileMenuButton) {
        mobileMenuButton.addEventListener('click', () => {
            if (mobileMenu) mobileMenu.classList.toggle('hidden');
        });
    }

    // Overlay click to close cart, and modals
    if (overlay) {
        overlay.addEventListener('click', () => {
            // Check if cart sidebar is open
            const cartSidebar = document.getElementById('cartSidebar');
            if (cartSidebar && !cartSidebar.classList.contains('translate-x-full')) {
                toggleCart(); // Close the cart
            }

            // Check if checkout modal is open
            const checkoutModal = document.getElementById('checkoutModal');
            if (checkoutModal && !checkoutModal.classList.contains('hidden')) {
                closeCheckout(); // Close checkout modal
            }

            // Check if confirmation modal is open
            const confirmationModal = document.getElementById('confirmationModal');
            if (confirmationModal && !confirmationModal.classList.contains('hidden')) {
                closeConfirmation(); // Close confirmation modal and clear cart
            }
        });
    }

    // Handle Contact Form Submission
    if (contactForm) {
        contactForm.addEventListener('submit', function(event) {
            event.preventDefault();
            // In a real application, you would send this data to a backend
            showToast('Message sent successfully!');
            contactForm.reset(); // Clear the form
        });
    }

    // Handle Login/Logout link in navigation
    if (loginLink) {
        loginLink.addEventListener('click', async (e) => {
            // Check if the link currently says "Logout"
            if (loginLink.textContent === 'Logout') {
                e.preventDefault(); // Prevent default link behavior
                try {
                    await firebase.auth().signOut(); // Corrected: Use firebase.auth().signOut()
                    console.log("User logged out from eventListeners.js");
                    // Reload page or update UI to reflect logout state
                    window.location.reload();
                } catch (error) {
                    console.error("Error logging out:", error);
                    showToast('Error logging out. Please try again.');
                }
            }
            // If it says "Login", default link behavior (to login.html) is fine
        });
    }

    if (mobileLoginLink) {
        mobileLoginLink.addEventListener('click', async (e) => {
            if (mobileLoginLink.textContent === 'Logout') {
                e.preventDefault();
                try {
                    await firebase.auth().signOut(); // Corrected: Use firebase.auth().signOut()
                    console.log("User logged out from eventListeners.js (mobile)");
                    window.location.reload();
                } catch (error) {
                    console.error("Error logging out:", error);
                    showToast('Error logging out. Please try again.');
                }
            }
        });
    }

    // Initial cart UI update on DOMContentLoaded
    // This ensures cart count and items are displayed correctly when the page loads
    updateCartUI();
});

// No need to expose window.toggleCart, window.checkout etc. here
// as they are exposed by uiUpdater.js directly.

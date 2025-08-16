// cartManager.js
// This file handles all cart-related logic, including adding, updating, and removing items.

import { updateCartUI, showToast } from './uiUpdater.js';
import { getProducts } from './productsData.js'; // Import getProducts to fetch from Firestore

// Initialize cart by loading from local storage, or start with an empty array if none exists.
// Using an array for cart items, as product IDs are unique and quantity is tracked per item.
let cart = JSON.parse(localStorage.getItem('cart')) || [];

/**
 * Saves the current state of the cart to local storage.
 */
function saveCart() {
    localStorage.setItem('cart', JSON.stringify(cart));
}

/**
 * Adds a product to the cart or updates its quantity if already present.
 * It now fetches product details from Firestore via getProducts.
 * @param {string} productId - The ID of the product to add (Firestore document ID).
 */
async function addToCart(productId) {
    // Fetch all products to find the specific product details
    const allProducts = await getProducts();
    let product = null;

    // Flatten all categories to find the product by ID
    for (const category in allProducts) {
        if (Array.isArray(allProducts[category])) { // Ensure it's an array before using find
            const foundProduct = allProducts[category].find(p => p.id === productId);
            if (foundProduct) {
                product = foundProduct;
                break;
            }
        }
    }

    if (!product) {
        showToast(`Sorry, product not found.`);
        console.error(`Product with ID ${productId} not found in Firestore.`);
        return;
    }

    if (product.stock === 0) {
        showToast(`Sorry, ${product.name} is out of stock.`);
        return;
    }

    const itemIndex = cart.findIndex(item => item.id === productId);

    if (itemIndex !== -1) {
        // Product is already in cart, increment quantity
        if (cart[itemIndex].quantity < product.stock) {
            cart[itemIndex].quantity++;
            showToast(`${product.name} quantity updated in cart!`);
        } else {
            showToast(`Cannot add more ${product.name}. Max stock reached.`);
            return;
        }
    } else {
        // Product not in cart, add new item
        cart.push({
            id: product.id,
            name: product.name,
            price: product.price,
            image: product.image,
            unit: product.unit,
            quantity: 1,
            category: product.category // Store category if needed for UI or other logic
        });
        showToast(`${product.name} added to cart!`);
    }

    saveCart(); // Save cart to local storage after modification
    updateCartUI(); // Update the cart display
}

/**
 * Updates the quantity of a specific item in the cart.
 * @param {string} productId - The ID of the product to update.
 * @param {number} change - The amount to change the quantity by (e.g., 1 for increment, -1 for decrement).
 */
async function updateCartItemQuantity(productId, change) {
    const itemIndex = cart.findIndex(item => item.id === productId);

    if (itemIndex !== -1) {
        const currentProductInCart = cart[itemIndex];
        // Fetch product details to check against current stock
        const allProducts = await getProducts();
        let productDetails = null;
        for (const category in allProducts) {
            if (Array.isArray(allProducts[category])) {
                const foundProduct = allProducts[category].find(p => p.id === productId);
                if (foundProduct) {
                    productDetails = foundProduct;
                    break;
                }
            }
        }

        if (!productDetails) {
            console.error(`Product details for ID ${productId} not found for quantity update.`);
            showToast('Product details not found.');
            return;
        }

        const newQuantity = currentProductInCart.quantity + change;

        if (newQuantity > 0) {
            if (newQuantity <= productDetails.stock) {
                cart[itemIndex].quantity = newQuantity;
                showToast(`${currentProductInCart.name} quantity changed.`);
            } else {
                showToast(`Cannot add more ${currentProductInCart.name}. Max stock reached.`);
                return; // Do not update cart if stock limit is hit
            }
        } else {
            // If new quantity is 0 or less, remove the item completely
            cart.splice(itemIndex, 1);
            showToast(`${currentProductInCart.name} removed from cart.`);
        }
        saveCart(); // Save cart to local storage after modification
        updateCartUI(); // Update the cart display
    }
}

/**
 * Removes an item completely from the cart.
 * @param {string} productId - The ID of the product to remove.
 */
function removeFromCart(productId) {
    cart = cart.filter(item => item.id !== productId);
    saveCart(); // Save cart to local storage after modification
    updateCartUI(); // Update the cart display
    showToast('Item removed from cart.');
}

/**
 * Gets the current state of the cart.
 * @returns {Array} The current cart array.
 */
function getCart() {
    return cart;
}

/**
 * Clears all items from the cart.
 */
function clearCart() {
    cart = [];
    saveCart(); // Save empty cart to local storage
    updateCartUI(); // Update the cart display
    showToast('Cart cleared!');
}

// Expose functions globally if they are called directly from HTML,
// otherwise, rely on module imports where needed.
window.addToCart = addToCart;
window.updateCartItemQuantity = updateCartItemQuantity;
window.removeFromCart = removeFromCart;
window.getCart = getCart;
window.clearCart = clearCart;

export { addToCart, updateCartItemQuantity, removeFromCart, getCart, clearCart };

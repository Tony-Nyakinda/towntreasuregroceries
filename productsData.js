// productsData.js
// This file now fetches product data from Firebase Firestore.
// It replaces the static product data previously held here.

import { db } from './firebase-config.js';
// Remove direct named imports for compat SDK functions, as they are accessed via the global firebase object.
// import { collection, getDocs } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore-compat.js";

/**
 * Generates the image path based on category and product name.
 * This function remains for consistency, assuming image naming conventions
 * are followed for images stored locally or referenced in Firestore.
 * @param {string} category - The category of the product.
 * @param {string} productName - The name of the product.
 * @returns {string} The constructed image path.
 */
function getImagePath(category, productName) {
    // Sanitize the product name to create a URL-friendly filename
    const sanitizedName = productName.toLowerCase().replace(/\s/g, '_').replace(/[^a-z0-9_]/g, '');
    let folder = '';
    switch (category) {
        case 'vegetables':
            folder = 'Vegetables';
            break;
        case 'fruits':
            folder = 'Fruits';
            break;
        case 'meat':
            folder = 'Meat';
            break;
        case 'dairy':
            folder = 'Dairy';
            break;
        case 'pantry':
            folder = 'Pantry';
            break;
        case 'beverages':
            folder = 'Beverages';
            break;
        case 'gift':
            folder = 'Gift';
            break;
        case 'wholesale': // New wholesale category
            folder = 'Wholesale';
            break;
        default:
            folder = 'General'; // Fallback folder if category is not mapped
    }
    // Assuming .png extension. Change to .jpg, .webp, etc., if your images are different.
    // If images are stored in Firebase Storage, this path would change to a storage URL.
    return `IMAGE/${folder}/${sanitizedName}.png`;
}

/**
 * Fetches product data from the 'products' collection in Firestore.
 * Transforms the data into a categorized structure.
 * @returns {Promise<Object>} A promise that resolves to an object of categorized products.
 */
async function getProducts() {
    // Access collection and getDocs via firebase.firestore()
    const productsCollectionRef = firebase.firestore().collection('products');
    const snapshot = await productsCollectionRef.get(); // Use .get() on the collection reference

    const products = {
        all: [], // To hold all unique products
        vegetables: [],
        fruits: [],
        meat: [],
        dairy: [],
        pantry: [],
        beverages: [],
        gift: [],
        wholesale: [] // Added new wholesale category
        // Add other categories as needed
    };

    const uniqueProducts = []; // Temporarily hold unique products to avoid duplicates

    snapshot.forEach(doc => {
        const product = {
            id: doc.id, // Use Firestore document ID as product ID
            ...doc.data()
        };
        uniqueProducts.push(product);
    });

    // Populate the 'all' category with unique products
    products.all = uniqueProducts;

    // Populate specific categories from the unique products list
    uniqueProducts.forEach(product => {
        if (product.category && products[product.category]) {
            products[product.category].push(product);
        }
    });

    console.log("Products fetched from Firestore:", products);
    return products;
}

export { getProducts, getImagePath };

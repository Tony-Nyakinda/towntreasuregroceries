// auth.js
// This file handles user authentication (register, login, logout) using Firebase Authentication.

import { auth, db } from './firebase-config.js';

// Define the super admin email directly in the client-side logic for checks.
// IMPORTANT: This MUST match the email set in your Firestore Security Rules' isOwner() function.
const SUPER_ADMIN_EMAIL = "towntreasuregroceries@gmail.com";

/**
 * Registers a new user with email and password and stores their role in Firestore.
 * @param {string} email - The user's email address.
 * @param {string} password - The user's password.
 * @param {string} role - The role of the user (e.g., 'customer', 'admin'). Defaults to 'customer'.
 * @param {Object} [userData={}] - Additional user data to store (e.g., fullName, phoneNumber).
 * @returns {Promise<Object>} A promise that resolves with the user object if registration is successful.
 * @throws {Error} Throws an error if registration fails.
 */
async function register(email, password, role = 'customer', userData = {}) {
    try {
        // Access createUserWithEmailAndPassword via firebase.auth()
        const userCredential = await firebase.auth().createUserWithEmailAndPassword(email, password);
        const user = userCredential.user;

        // Store user role and additional data in Firestore
        // Access doc and setDoc via firebase.firestore()
        await firebase.firestore().collection('users').doc(user.uid).set({
            email: email,
            role: role,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(), // Use serverTimestamp for Firestore
            emailVerified: false, // Add email verification status
            ...userData // Include any additional user data
        });
        
        // Send email verification
        await sendEmailVerification(user);
        
        console.log("User registered and verification email sent:", user.email);
        return user;
    } catch (error) {
        console.error("Error during registration:", error.message);
        throw error;
    }
}

/**
 * Sends email verification to a user
 * @param {Object} user - Firebase user object
 * @returns {Promise<void>}
 */
async function sendEmailVerification(user) {
    try {
        await user.sendEmailVerification();
        console.log("Verification email sent to", user.email);
    } catch (error) {
        console.error("Error sending verification email:", error);
        throw error;
    }
}

/**
 * Resends email verification to the current user
 * @returns {Promise<void>}
 */
async function resendVerificationEmail() {
    const user = firebase.auth().currentUser;
    if (!user) {
        throw new Error("No user is signed in.");
    }
    return sendEmailVerification(user);
}

/**
 * Logs in an existing user with email and password.
 * @param {string} email - The user's email address.
 * @param {string} password - The user's password.
 * @returns {Promise<Object>} A promise that resolves with the user credential object if login is successful.
 * @throws {Error} Throws an error if login fails.
 */
async function login(email, password) {
    try {
        // Access signInWithEmailAndPassword via firebase.auth()
        const userCredential = await firebase.auth().signInWithEmailAndPassword(email, password);
        console.log("User logged in:", userCredential.user.email);
        return userCredential;
    } catch (error) {
        console.error("Error during login:", error.message);
        throw error;
    }
}

/**
 * Logs out the current user.
 * @returns {Promise<void>} A promise that resolves when the user is logged out.
 * @throws {Error} Throws an error if logout fails.
 */
async function logout() {
    try {
        // Access signOut via firebase.auth()
        await firebase.auth().signOut();
        console.log("User logged out successfully.");
    } catch (error) {
        console.error("Error during logout:", error.message);
        throw error;
    }
}

/**
 * Sends a password reset email to the user
 * @param {string} email - The user's email address
 * @returns {Promise<void>}
 */
async function sendPasswordResetEmail(email) {
    try {
        await firebase.auth().sendPasswordResetEmail(email);
        console.log("Password reset email sent to", email);
    } catch (error) {
        console.error("Error sending password reset email:", error);
        throw error;
    }
}

/**
 * Checks the current user's authentication state and retrieves their role.
 * This function now also checks if the user's email matches the SUPER_ADMIN_EMAIL.
 * @returns {Promise<{user: Object|null, role: string|null}>} A promise that resolves with the user object and their role, or null if no user is logged in.
 */
async function getCurrentUserWithRole() {
    return new Promise((resolve) => {
        // Access onAuthStateChanged via firebase.auth()
        const unsubscribe = firebase.auth().onAuthStateChanged(async (user) => {
            unsubscribe(); // Unsubscribe after the first call
            if (user) {
                // First, check if the user's email is the super admin email
                if (user.email === SUPER_ADMIN_EMAIL) {
                    console.log("User is super admin by email:", user.email);
                    resolve({ user: user, role: 'admin' }); // Assign 'admin' role if it's the super admin email
                    return;
                }

                try {
                    // Access collection and doc via firebase.firestore()
                    const userDocRef = firebase.firestore().collection('users').doc(user.uid);
                    const userDocSnap = await userDocRef.get(); // Use .get() method on DocumentReference
                    if (userDocSnap.exists) { // .exists is a property, not a function
                        resolve({ user: user, role: userDocSnap.data().role });
                    } else {
                        console.warn("User document not found for UID:", user.uid);
                        resolve({ user: user, role: null }); // User exists but no role in Firestore
                    }
                } catch (error) {
                    console.error("Error fetching user role:", error.message);
                    resolve({ user: user, role: null });
                }
            } else {
                resolve({ user: null, role: null });
            }
        });
    });
}

// NEW FUNCTION: getCurrentUserRole
async function getCurrentUserRole() {
  const user = auth.currentUser;
  if (!user) return null;
  
  const doc = await db.collection('users').doc(user.uid).get();
  return doc.exists ? doc.data().role : null;
}

// Google Sign-in Function
async function signInWithGoogle() {
  try {
    const provider = new firebase.auth.GoogleAuthProvider();
    const userCredential = await firebase.auth().signInWithPopup(provider);
    const user = userCredential.user;

    // Check if user is new
    if (userCredential.additionalUserInfo?.isNewUser) {
      // Create user document for new Google sign-in
      await firebase.firestore().collection('users').doc(user.uid).set({
        email: user.email,
        role: 'customer',
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        fullName: user.displayName || '',
        photoURL: user.photoURL || '',
        emailVerified: true // Google sign-in emails are verified
      });
      console.log("New Google user registered:", user.email);
    } else {
      console.log("Existing Google user logged in:", user.email);
    }
    
    return user;
  } catch (error) {
    console.error("Error during Google sign-in:", error.message);
    throw error;
  }
}

// Export all functions
export { 
  register, 
  login, 
  logout, 
  getCurrentUserWithRole, 
  getCurrentUserRole, 
  signInWithGoogle,
  sendEmailVerification,
  resendVerificationEmail,
  sendPasswordResetEmail
};
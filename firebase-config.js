// firebase-config.js
// This file initializes Firebase and exports the auth and firestore instances.

// Import the Firebase App compat library first, which provides the global 'firebase' object.
import "https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js";
// Import auth and firestore compat libraries to make their services available via the global 'firebase' object.
import "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth-compat.js";
import "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore-compat.js";

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyDavdHO4QijL6C4U_QWETQOQahb1MNSN_Y",
  authDomain: "town-treasure-groceries-6e386.firebaseapp.com",
  projectId: "town-treasure-groceries-6e386",
  storageBucket: "town-treasure-groceries-6e386.firebasestorage.app",
  messagingSenderId: "79678545758",
  appId: "1:79678545758:web:bca9c7bb60639e5396f9cf",
  measurementId: "G-4TJPGY1PRJ" // This is optional and not strictly needed for auth/firestore
};

// Initialize Firebase App
const app = firebase.initializeApp(firebaseConfig);

// Get Auth and Firestore instances using the compat API
const auth = firebase.auth();
const db = firebase.firestore();

// Export them for use in other modules
export { auth, db, app };

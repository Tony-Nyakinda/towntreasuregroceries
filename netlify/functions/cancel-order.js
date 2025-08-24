// netlify/functions/cancel-order.js

// IMPORTANT: This file should be placed in the `netlify/functions` directory of your project.

// This function securely handles the deletion of an unpaid order from the Supabase database.
// It uses environment variables for Supabase credentials, which should be set in your Netlify dashboard.

const { createClient } = require('@supabase/supabase-js');
const admin = require('firebase-admin');

// Initialize Firebase Admin SDK
// This is necessary to verify the user's identity from the token sent by the client.
// Your Firebase service account key should be stored as a JSON string in a Netlify environment variable.
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY))
  });
}

const handler = async (event, context) => {
    // Only allow POST requests
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        // --- User Authentication ---
        // Get the ID token from the Authorization header
        const idToken = event.headers.authorization.split('Bearer ')[1];
        if (!idToken) {
            return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized: No token provided.' }) };
        }

        // Verify the token using Firebase Admin SDK
        const decodedToken = await admin.auth().verifyIdToken(idToken);
        const uid = decodedToken.uid;

        // --- Order Deletion Logic ---
        const { orderId } = JSON.parse(event.body);
        if (!orderId) {
            return { statusCode: 400, body: JSON.stringify({ error: 'Order ID is required.' }) };
        }

        // Initialize Supabase client with the service role key for admin-level access
        // These environment variables MUST be set in your Netlify project settings.
        const supabaseUrl = process.env.SUPABASE_URL;
        const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
        const supabase = createClient(supabaseUrl, supabaseKey);

        // Delete the order from the 'unpaid_orders' table
        // We match both the order ID and the user's UID to ensure a user can only delete their own orders.
        const { data, error } = await supabase
            .from('unpaid_orders')
            .delete()
            .match({ id: orderId, user_id: uid }); // Security check: user can only delete their own order

        if (error) {
            // If there's a database error, throw it to be caught by the catch block
            throw error;
        }

        // If the deletion is successful
        return {
            statusCode: 200,
            body: JSON.stringify({ message: 'Order cancelled successfully.' })
        };

    } catch (error) {
        // Handle any errors that occur during the process
        console.error('Error in cancel-order function:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: error.message || 'An internal server error occurred.' })
        };
    }
};

module.exports = { handler };

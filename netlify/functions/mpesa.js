// netlify/functions/mpesa.js
// This version includes the /getPaymentStatus endpoint for client-side polling.

require('dotenv').config();
const axios = require("axios");
const admin = require("firebase-admin");
const { createClient } = require('@supabase/supabase-js');

// --- Initialize Supabase Admin Client ---
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// --- Firebase Admin Initialization (for temporary records) ---
try {
  if (admin.apps.length === 0) {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
  }
} catch (error) {
  console.error("CRITICAL: Failed to initialize Firebase Admin SDK.", error.message);
}
const db = admin.firestore();

// --- M-PESA CREDENTIALS ---
const consumerKey = process.env.MPESA_CONSUMER_KEY;
const consumerSecret = process.env.MPESA_CONSUMER_SECRET;
const shortCode = process.env.MPESA_SHORTCODE;
const passkey = process.env.MPESA_PASSKEY;
const tokenUrl = "https://api.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials";
const stkPushUrl = "https://api.safaricom.co.ke/mpesa/stkpush/v1/processrequest";
const stkPushQueryUrl = "https://api.safaricom.co.ke/mpesa/stkpushquery/v1/query"; // URL for checking status

// Helper to get M-Pesa auth token
const getAuthToken = async () => {
  const auth = "Basic " + Buffer.from(consumerKey + ":" + consumerSecret).toString("base64");
  try {
    const response = await axios.get(tokenUrl, { headers: { "Authorization": auth } });
    return response.data.access_token;
  } catch (error) {
    console.error("Error fetching M-Pesa token:", error.response ? error.response.data : error.message);
    throw new Error("Could not get M-Pesa auth token.");
  }
};

// Main function handler
exports.handler = async (event) => {
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS'
    };

    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 204, headers };
    }

    const path = event.path.replace('/.netlify/functions/mpesa', '');

    // --- Endpoint to INITIATE STK PUSH ---
    if (path === '/initiateMpesaPayment') {
        const { phone, amount, orderDetails } = JSON.parse(event.body);

        if (!phone || !amount || !orderDetails) {
            return { statusCode: 400, headers, body: JSON.stringify({ error: "Missing required fields" }) };
        }
        
        // Handle "Pay on Delivery"
        if (orderDetails.paymentMethod === 'Pay on Delivery') {
            // ... (Your existing Pay on Delivery logic)
        }

        // --- Logic for M-Pesa STK Push ---
        const timestamp = new Date().toISOString().replace(/[^0-9]/g, "").slice(0, 14);
        const password = Buffer.from(shortCode + passkey + timestamp).toString("base64");
        const callbackUrl = `${process.env.URL}/.netlify/functions/mpesa/mpesaCallback`;

        const payload = {
            BusinessShortCode: shortCode,
            Password: password,
            Timestamp: timestamp,
            TransactionType: "CustomerPayBillOnline",
            Amount: Math.round(amount),
            PartyA: phone.replace(/^0/, '254'),
            PartyB: shortCode,
            PhoneNumber: phone.replace(/^0/, '254'),
            CallBackURL: callbackUrl,
            AccountReference: orderDetails.orderNumber,
            TransactionDesc: `Payment for Order ${orderDetails.orderNumber}`,
        };

        try {
            const token = await getAuthToken();
            const mpesaResponse = await axios.post(stkPushUrl, payload, { headers: { "Authorization": `Bearer ${token}` } });
            const checkoutRequestID = mpesaResponse.data.CheckoutRequestID;

            await db.collection('pending_payments').doc(checkoutRequestID).set({
                orderDetails: orderDetails,
                timestamp: admin.firestore.FieldValue.serverTimestamp()
            });

            return { statusCode: 200, headers, body: JSON.stringify({ checkoutRequestID }) };
        } catch (error) {
            console.error("Error initiating STK push:", error.response ? error.response.data : error.message);
            return { statusCode: 500, headers, body: JSON.stringify({ error: "Failed to initiate M-Pesa payment." }) };
        }
    }

    // --- Endpoint to HANDLE M-PESA CALLBACK ---
    if (path === '/mpesaCallback') {
        // ... (Your existing callback logic remains the same)
    }

    // ========================================================================
    // START: NEW ENDPOINT TO CHECK PAYMENT STATUS
    // ========================================================================
    if (path === '/getPaymentStatus') {
        const { checkoutRequestID } = JSON.parse(event.body);

        if (!checkoutRequestID) {
            return { statusCode: 400, headers, body: JSON.stringify({ error: "Missing CheckoutRequestID" }) };
        }

        try {
            const token = await getAuthToken();
            const timestamp = new Date().toISOString().replace(/[^0-9]/g, "").slice(0, 14);
            const password = Buffer.from(shortCode + passkey + timestamp).toString("base64");

            const payload = {
                BusinessShortCode: shortCode,
                Password: password,
                Timestamp: timestamp,
                CheckoutRequestID: checkoutRequestID
            };

            const mpesaResponse = await axios.post(stkPushQueryUrl, payload, {
                headers: { "Authorization": `Bearer ${token}` }
            });

            const resultCode = mpesaResponse.data.ResultCode;
            const resultDesc = mpesaResponse.data.ResultDesc;

            if (resultCode === "0") {
                // Payment was successful. Check if the order has been processed and saved to Supabase.
                const { data: finalOrder, error } = await supabase
                    .from('paid_orders')
                    .select('*')
                    .eq('order_number', checkoutRequestID) // Assuming order_number is the M-Pesa receipt
                    .single();

                if (finalOrder) {
                    return { statusCode: 200, headers, body: JSON.stringify({ status: 'paid', finalOrder: finalOrder, message: "Payment successful!" }) };
                } else {
                    // This can happen if the callback is slow; the client should keep polling.
                    return { statusCode: 200, headers, body: JSON.stringify({ status: 'pending', message: "Payment successful, order processing." }) };
                }
            } else if (resultCode === "1032") {
                return { statusCode: 200, headers, body: JSON.stringify({ status: 'cancelled', message: "Transaction cancelled by user." }) };
            } else {
                // Any other code means the payment failed or is still pending.
                return { statusCode: 200, headers, body: JSON.stringify({ status: 'failed', message: resultDesc }) };
            }
        } catch (error) {
            console.error("Error checking payment status:", error.response ? error.response.data : error.message);
            // If the query fails, it's likely the transaction is still processing.
            return { statusCode: 200, headers, body: JSON.stringify({ status: 'pending', message: "Status check failed, still processing." }) };
        }
    }
    // ========================================================================
    // END: NEW ENDPOINT
    // ========================================================================

    return { statusCode: 404, headers, body: 'Endpoint not found.' };
};

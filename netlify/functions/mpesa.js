// netlify/functions/mpesa.js

require('dotenv').config();
const axios = require("axios");
const admin = require("firebase-admin");
const { createClient } = require('@supabase/supabase-js');

// --- Initialize Supabase Admin Client ---
// This securely uses the environment variables you set in Netlify
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

        // If the order is "Pay on Delivery", save it directly to Supabase and return
        if (orderDetails.paymentMethod === 'Pay on Delivery') {
            try {
                const { data, error } = await supabase
                    .from('unpaid_orders')
                    .insert([{
                        order_number: orderDetails.orderNumber,
                        user_id: orderDetails.userId,
                        full_name: orderDetails.fullName,
                        phone: orderDetails.phone,
                        address: orderDetails.address,
                        items: orderDetails.items,
                        total: orderDetails.total,
                        payment_status: 'unpaid'
                    }]).select();

                if (error) throw error;

                console.log('Unpaid order saved to Supabase:', data);
                return { statusCode: 200, headers, body: JSON.stringify({ success: true, order: data[0] }) };

            } catch (error) {
                console.error("Error saving unpaid order to Supabase:", error);
                return { statusCode: 500, headers, body: JSON.stringify({ error: "Failed to save unpaid order." }) };
            }
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

            // Temporarily store order details in Firestore to link with the callback
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
        const body = JSON.parse(event.body);
        const stkCallback = body.Body.stkCallback;
        const checkoutRequestID = stkCallback.CheckoutRequestID;
        const resultCode = stkCallback.ResultCode;

        try {
            const pendingDoc = await db.collection('pending_payments').doc(checkoutRequestID).get();
            if (!pendingDoc.exists) {
                console.error(`No pending payment found for ${checkoutRequestID}`);
                return { statusCode: 200, headers, body: JSON.stringify({ ResultCode: 0, ResultDesc: "Accepted" }) };
            }

            const { orderDetails } = pendingDoc.data();

            if (resultCode === 0) {
                // SUCCESS: Save to Supabase 'paid_orders'
                const metadata = stkCallback.CallbackMetadata.Item;
                const receiptItem = metadata.find(item => item.Name === "MpesaReceiptNumber");
                const mpesaReceipt = receiptItem ? receiptItem.Value : 'N/A';

                const { error } = await supabase
                    .from('paid_orders')
                    .insert([{
                        order_number: orderDetails.orderNumber,
                        user_id: orderDetails.userId,
                        full_name: orderDetails.fullName,
                        phone: orderDetails.phone,
                        address: orderDetails.address,
                        items: orderDetails.items,
                        total: orderDetails.total,
                        payment_status: 'paid',
                        mpesa_receipt_number: mpesaReceipt
                    }]);

                if (error) throw error;
                console.log(`Successfully saved paid order ${orderDetails.orderNumber} to Supabase.`);
            }

            // Clean up the temporary document from Firestore
            await db.collection('pending_payments').doc(checkoutRequestID).delete();

        } catch (error) {
            console.error("Error in M-Pesa callback:", error);
        } finally {
            return { statusCode: 200, headers, body: JSON.stringify({ ResultCode: 0, ResultDesc: "Accepted" }) };
        }
    }

    return { statusCode: 404, headers, body: 'Endpoint not found.' };
};
// netlify/functions/mpesa.js
// This version implements the robust payment flow.

require('dotenv').config();
const axios = require("axios");
const admin = require("firebase-admin");

// --- Firebase Admin Initialization ---
try {
  if (admin.apps.length === 0) {
    console.log("Initializing Firebase Admin SDK...");
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
    console.log("Firebase Admin SDK initialized.");
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

const tokenUrl = "https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials";
const stkPushUrl = "https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest";

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

// Main function handler for Netlify
exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers };
  }

  if (admin.apps.length === 0) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: "Backend Firebase service not configured." }) };
  }

  const path = event.path.replace('/.netlify/functions/mpesa', '');

  // --- Endpoint to INITIATE STK PUSH ---
  if (path === '/initiateMpesaPayment') {
    const { phone, amount, orderId } = JSON.parse(event.body);

    if (!phone || !amount || !orderId) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: "Missing required fields" }) };
    }

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
      AccountReference: orderId, // Use the Firestore Order ID as the reference
      TransactionDesc: `Payment for Order ${orderId}`,
    };

    try {
      const token = await getAuthToken();
      const response = await axios.post(stkPushUrl, payload, {
        headers: { "Authorization": `Bearer ${token}` },
      });
      
      const checkoutRequestID = response.data.CheckoutRequestID;
      console.log(`STK Push initiated. CheckoutRequestID: ${checkoutRequestID}`);
      
      // The client-side code (`catalog.js`) is responsible for adding the order to Firestore.
      // This function will find that order in the callback step using a collectionGroup query.

      return { statusCode: 200, headers, body: JSON.stringify(response.data) };
    } catch (error) {
      console.error("Error initiating STK push:", error.response ? error.response.data : error.message);
      // It's difficult to update the order here if we don't know its exact path.
      // The callback will handle the failure status.
      return { statusCode: 500, headers, body: JSON.stringify({ error: "Failed to initiate M-Pesa payment." }) };
    }
  }

  // --- Endpoint to HANDLE M-PESA CALLBACK ---
  if (path === '/mpesaCallback') {
    const body = JSON.parse(event.body);
    console.log("M-Pesa Callback Received:", JSON.stringify(body, null, 2));
    
    const stkCallback = body.Body.stkCallback;
    if (!stkCallback) {
        return { statusCode: 200, headers, body: JSON.stringify({ message: "Invalid callback format." }) };
    }

    const checkoutRequestID = stkCallback.CheckoutRequestID;
    const resultCode = stkCallback.ResultCode;
    const resultDesc = stkCallback.ResultDesc;

    try {
        // AMENDMENT: Use a collectionGroup query to find the 'orders' collection wherever it is.
        const ordersQuery = db.collectionGroup("orders").where("mpesaCheckoutRequestID", "==", checkoutRequestID).limit(1);
        const snapshot = await ordersQuery.get();

        if (snapshot.empty) {
            console.error(`No order found for CheckoutRequestID: ${checkoutRequestID}`);
            return { statusCode: 200, headers, body: JSON.stringify({ ResultCode: 0, ResultDesc: "No matching order found" }) };
        }

        const orderDoc = snapshot.docs[0];
        let updateData = {
            mpesaResultCode: resultCode,
            mpesaResultDesc: resultDesc,
        };

        if (resultCode === 0) {
            // SUCCESS
            console.log(`Payment successful for order: ${orderDoc.id}`);
            updateData.paymentStatus = "paid";
            const metadata = stkCallback.CallbackMetadata.Item;
            const receiptItem = metadata.find(item => item.Name === "MpesaReceiptNumber");
            if (receiptItem) {
                updateData.mpesaReceiptNumber = receiptItem.Value;
            }
        } else {
            // FAILURE
            console.log(`Payment failed for order: ${orderDoc.id}. Reason: ${resultDesc}`);
            updateData.paymentStatus = "failed";
        }
        
        await orderDoc.ref.update(updateData);
        return { statusCode: 200, headers, body: JSON.stringify({ ResultCode: 0, ResultDesc: "Callback processed" }) };

    } catch (error) {
        console.error("Error processing callback:", error);
        return { statusCode: 500, headers, body: JSON.stringify({ message: "Internal server error." }) };
    }
  }

  return {
    statusCode: 404,
    headers,
    body: 'Endpoint not found.'
  };
};

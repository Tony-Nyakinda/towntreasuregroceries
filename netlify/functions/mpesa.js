// netlify/functions/mpesa.js
// This is your secure backend function for handling M-Pesa payments, adapted for Netlify.

const axios = require("axios");
const admin = require("firebase-admin");

// --- IMPORTANT: FIREBASE SETUP ---
// To allow Netlify to talk to your Firestore database, you need a Service Account Key.
// 1. Go to your Firebase project console > Project settings > Service accounts.
// 2. Click "Generate new private key". A JSON file will be downloaded.
// 3. Open the JSON file, copy the entire content.
// 4. In your Netlify project settings (UI), go to Site settings > Build & deploy > Environment.
// 5. Add a new environment variable:
//    Key: FIREBASE_SERVICE_ACCOUNT_KEY
//    Value: PASTE_THE_COPIED_JSON_CONTENT_HERE

// Initialize Firebase Admin only once
if (admin.apps.length === 0) {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}
const db = admin.firestore();

// --- MPESA CREDENTIALS ---
// Add these to your Netlify environment variables as well.
const consumerKey = process.env.MPESA_CONSUMER_KEY;
const consumerSecret = process.env.MPESA_CONSUMER_SECRET;
const shortCode = process.env.MPESA_SHORTCODE;
const passkey = process.env.MPESA_PASSKEY;

// M-Pesa Daraja SANDBOX API URLs
const tokenUrl = "https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials";
const stkPushUrl = "https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest";

// Helper function to get a new M-Pesa auth token
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
exports.handler = async (event, context) => {
  // Set up CORS headers to allow requests from your website
  const headers = {
    'Access-Control-Allow-Origin': '*', // Or specify your website domain for better security
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };

  // Netlify functions must handle OPTIONS requests for CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers
    };
  }

  // Determine which endpoint is being called based on the path
  const path = event.path.replace('/.netlify/functions/mpesa', '');

  // --- Endpoint to INITIATE STK PUSH ---
  if (path === '/initiateMpesaPayment') {
    const body = JSON.parse(event.body);
    const { phone, amount, orderId } = body;

    if (!phone || !amount || !orderId) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: "Missing required fields" }) };
    }

    const formattedPhone = phone.replace(/^0/, '254').replace(/^\+/, '');
    const timestamp = new Date().toISOString().replace(/[^0-9]/g, "").slice(0, 14);
    const password = Buffer.from(shortCode + passkey + timestamp).toString("base64");
    
    // The callback URL will be your Netlify function's URL + /mpesaCallback
    const callbackUrl = `${process.env.URL}/.netlify/functions/mpesa/mpesaCallback`;

    const payload = {
      BusinessShortCode: shortCode,
      Password: password,
      Timestamp: timestamp,
      TransactionType: "CustomerPayBillOnline",
      Amount: Math.round(amount),
      PartyA: formattedPhone,
      PartyB: shortCode,
      PhoneNumber: formattedPhone,
      CallBackURL: callbackUrl,
      AccountReference: orderId,
      TransactionDesc: `Payment for Order ${orderId}`,
    };

    try {
      const token = await getAuthToken();
      const response = await axios.post(stkPushUrl, payload, {
        headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
      });
      return { statusCode: 200, headers, body: JSON.stringify(response.data) };
    } catch (error) {
      console.error("Error initiating STK push:", error.response ? error.response.data : error.message);
      return { statusCode: 500, headers, body: JSON.stringify({ error: "Failed to initiate M-Pesa payment." }) };
    }
  }

  // --- Endpoint to HANDLE M-PESA CALLBACK ---
  if (path === '/mpesaCallback') {
    const body = JSON.parse(event.body);
    console.log("M-Pesa Callback Received:", JSON.stringify(body, null, 2));
    
    const result = body.Body.stkCallback;
    if (!result) {
        return { statusCode: 400, headers, body: JSON.stringify({ message: "Invalid callback format." }) };
    }

    const resultCode = result.ResultCode;
    const orderId = result.AccountReference;
    const orderDocRef = db.collection("orders").doc(orderId);

    try {
        let updateData = {
            paymentStatus: "failed",
            mpesaResultCode: resultCode,
            mpesaResultDesc: result.ResultDesc,
        };

        if (resultCode === 0) {
            updateData.paymentStatus = "paid";
            const receiptItem = result.CallbackMetadata.Item.find(item => item.Name === "MpesaReceiptNumber");
            if (receiptItem) updateData.mpesaReceiptNumber = receiptItem.Value;
        }
        
        await orderDocRef.update(updateData);
        return { statusCode: 200, headers, body: JSON.stringify({ ResultCode: 0, ResultDesc: "Callback processed" }) };

    } catch (error) {
        console.error("Error processing callback:", error);
        return { statusCode: 500, headers, body: JSON.stringify({ message: "Internal server error." }) };
    }
  }

  // Fallback for unknown paths
  return {
    statusCode: 404,
    headers,
    body: 'Endpoint not found.'
  };
};

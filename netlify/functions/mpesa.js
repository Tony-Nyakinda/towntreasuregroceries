// netlify/functions/mpesa.js
// This version includes enhanced logging to help debug environment variable issues.

const axios = require("axios");
const admin = require("firebase-admin");

// --- Enhanced Debugging: Log right at the start ---
console.log("Netlify function starting up...");

// --- Firebase Admin Initialization with Debugging ---
try {
  if (admin.apps.length === 0) {
    console.log("Attempting to initialize Firebase Admin SDK...");
    if (!process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
      throw new Error("FIREBASE_SERVICE_ACCOUNT_KEY environment variable not found.");
    }
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
    console.log("Firebase Admin SDK initialized successfully.");
  }
} catch (error) {
  console.error("CRITICAL: Failed to initialize Firebase Admin SDK.", error.message);
  // This will stop the function from proceeding if Firebase setup fails.
  // We will return an error from the handler if this fails.
}

const db = admin.firestore();

// --- M-PESA CREDENTIALS with Debugging ---
const consumerKey = process.env.MPESA_CONSUMER_KEY;
const consumerSecret = process.env.MPESA_CONSUMER_SECRET;
const shortCode = process.env.MPESA_SHORTCODE;
const passkey = process.env.MPESA_PASSKEY;

// Log to check if keys are loaded (but not the secret values themselves)
console.log("MPESA_CONSUMER_KEY loaded:", !!consumerKey);
console.log("MPESA_CONSUMER_SECRET loaded:", !!consumerSecret);
console.log("MPESA_SHORTCODE loaded:", !!shortCode);
console.log("MPESA_PASSKEY loaded:", !!passkey);


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
  console.log(`Request received for path: ${event.path}`);
  
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers };
  }
  
  // Check if Firebase failed to initialize earlier
  if (admin.apps.length === 0) {
      return { statusCode: 500, headers, body: JSON.stringify({ error: "Backend Firebase service is not configured correctly." }) };
  }

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
      console.log("STK Push initiated successfully.");
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

  return {
    statusCode: 404,
    headers,
    body: 'Endpoint not found.'
  };
};

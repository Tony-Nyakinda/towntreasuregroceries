// netlify/functions/mpesa.js
// This version implements the robust payment flow with Supabase integration.

require('dotenv').config();
const axios = require("axios");
const admin = require("firebase-admin");
const { createClient } = require('@supabase/supabase-js');

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

// --- Supabase Initialization ---
let supabase;
try {
    console.log("Initializing Supabase client...");
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !supabaseKey) {
        throw new Error("Supabase URL or Key is missing from environment variables.");
    }
    supabase = createClient(supabaseUrl, supabaseKey, {
        auth: { persistSession: false },
        db: { schema: 'public' }
    });
    console.log("Supabase client initialized.");
} catch (error) {
    console.error("CRITICAL: Failed to initialize Supabase client.", error.message);
}

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

  if (admin.apps.length === 0 || !supabase) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: "Backend services not configured." }) };
  }

  const path = event.path.replace('/.netlify/functions/mpesa', '');

  // --- Endpoint to INITIATE STK PUSH ---
  if (path === '/initiateMpesaPayment') {
    const { phone, amount, orderDetails } = JSON.parse(event.body);

    if (!phone || !amount || !orderDetails) {
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
      AccountReference: orderDetails.orderNumber,
      TransactionDesc: `Payment for Order ${orderDetails.orderNumber}`,
    };

    try {
      const token = await getAuthToken();
      const mpesaResponse = await axios.post(stkPushUrl, payload, {
        headers: { "Authorization": `Bearer ${token}` },
      });
      
      const checkoutRequestID = mpesaResponse.data.CheckoutRequestID;
      console.log(`STK Push initiated. CheckoutRequestID: ${checkoutRequestID}`);

      // AMENDMENT: Create a temporary record in Supabase instead of a Firebase batch
      const { data: tempOrder, error: tempOrderError } = await supabase
          .from('pending_payments') // Assuming you have a table named 'pending_payments' in Supabase
          .insert([{ checkoutRequestID: checkoutRequestID, orderDetails: orderDetails }]);
      
      if (tempOrderError) throw tempOrderError;
      
      // Keep the public status in Firebase for the client-side listener
      const publicStatusRef = db.collection('payment_status').doc(checkoutRequestID);
      await publicStatusRef.set({ status: 'pending', userId: orderDetails.userId });

      console.log(`Temporary Supabase and Firebase records created for ${checkoutRequestID}`);
      
      return { statusCode: 200, headers, body: JSON.stringify({ checkoutRequestID: checkoutRequestID }) };

    } catch (error) {
      console.error("Error initiating STK push:", error.response ? error.response.data : error.message);
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
        // AMENDMENT: Get the pending order from Supabase
        const { data: pendingPayment, error: pendingPaymentError } = await supabase
            .from('pending_payments')
            .select('orderDetails')
            .eq('checkoutRequestID', checkoutRequestID)
            .single();

        if (pendingPaymentError || !pendingPayment) {
            console.error(`No pending payment record found for CheckoutRequestID: ${checkoutRequestID}. Error: ${pendingPaymentError?.message}`);
            return { statusCode: 200, headers, body: JSON.stringify({ ResultCode: 0, ResultDesc: "No matching record found" }) };
        }
        
        const orderDetails = pendingPayment.orderDetails;
        const publicStatusRef = db.collection('payment_status').doc(checkoutRequestID);

        if (resultCode === 0) {
            // SUCCESS
            console.log(`Payment successful for CheckoutRequestID: ${checkoutRequestID}`);
            const metadata = stkCallback.CallbackMetadata.Item;
            const receiptItem = metadata.find(item => item.Name === "MpesaReceiptNumber");
            
            orderDetails.paymentStatus = "paid";
            orderDetails.mpesaResultCode = resultCode;
            orderDetails.mpesaResultDesc = resultDesc;
            if (receiptItem) {
                orderDetails.mpesaReceiptNumber = receiptItem.Value;
                orderDetails.orderNumber = receiptItem.Value;
            }
            
            // AMENDMENT: Set the timestamp and save the order to the final 'orders' table in Supabase
            orderDetails.timestamp = new Date();
            const { data: finalOrder, error: finalOrderError } = await supabase
                .from('orders') // Assuming you have an 'orders' table in Supabase
                .insert([orderDetails]);

            if (finalOrderError) throw finalOrderError;
            console.log(`Order ${orderDetails.orderNumber} saved successfully to Supabase.`);
            
            // Update the public Firebase doc so the client gets the success signal
            await publicStatusRef.update({ status: 'paid', finalOrder: orderDetails });
            
            // Clean up the temporary record in Supabase and Firebase
            await supabase.from('pending_payments').delete().eq('checkoutRequestID', checkoutRequestID);
            await publicStatusRef.delete();
            

        } else {
            // FAILURE
            console.log(`Payment failed for CheckoutRequestID: ${checkoutRequestID}. Reason: ${resultDesc}`);
            // Update the public Firebase doc so the client gets the failure signal
            await publicStatusRef.update({ status: 'failed', reason: resultDesc });
            
            // Clean up the temporary Supabase record
            await supabase.from('pending_payments').delete().eq('checkoutRequestID', checkoutRequestID);
        }
        
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


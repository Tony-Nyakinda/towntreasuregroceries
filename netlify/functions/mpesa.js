// netlify/functions/mpesa.js
// FINAL MIGRATION: This version removes all Firebase Firestore dependencies for payment tracking
// and uses a Supabase table ('payment_tracking') instead.

require('dotenv').config();
const axios = require("axios");
// Firebase Admin is no longer needed for Firestore, but might be used for auth elsewhere.
// We will remove the db initialization to prevent quota issues.
const admin = require("firebase-admin");
const { createClient } = require('@supabase/supabase-js');

// --- Supabase Admin Initialization ---
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// --- Firebase Admin Initialization (IF NEEDED FOR OTHER FUNCTIONS, KEEP. FOR THIS FILE, IT'S NOT USED FOR DB) ---
try {
  if (admin.apps.length === 0) {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
  }
} catch (error) {
  console.error("Firebase Admin SDK initialization error (may not be critical for this function):", error.message);
}
// We no longer initialize Firestore: const db = admin.firestore();

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
    const { phone, amount, orderDetails, unpaidOrderId } = JSON.parse(event.body);

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

      // --- DEBUGGING: Log the exact payload being sent to M-Pesa ---
      console.log("Payload being sent to M-Pesa:", JSON.stringify(payload, null, 2));

      const mpesaResponse = await axios.post(stkPushUrl, payload, {
        headers: { "Authorization": `Bearer ${token}` },
      });
      
      const checkoutRequestID = mpesaResponse.data.CheckoutRequestID;
      console.log(`STK Push initiated. CheckoutRequestID: ${checkoutRequestID}`);

      // Create a temporary record in Supabase instead of Firebase
      const { error: insertError } = await supabase
        .from('payment_tracking')
        .insert([{
            checkout_request_id: checkoutRequestID,
            order_details: orderDetails,
            unpaid_order_id: unpaidOrderId || null,
            order_number: orderDetails.orderNumber,
            status: 'pending'
        }]);

      if (insertError) {
        throw new Error(`Supabase insert error: ${insertError.message}`);
      }
      
      console.log(`Temporary record created in Supabase for ${checkoutRequestID}`);
      
      return { statusCode: 200, headers, body: JSON.stringify({ checkoutRequestID: checkoutRequestID }) };

    } catch (error) {
      console.error("Error initiating STK push:", error.response ? error.response.data : error.message);
      return { statusCode: 500, headers, body: JSON.stringify({ error: "Failed to initiate M-Pesa payment." }) };
    }
  }
  
  // --- POLLING ENDPOINT (Now reads from Supabase) ---
  if (path === '/getPaymentStatus') {
    const { checkoutRequestID } = JSON.parse(event.body);

    if (!checkoutRequestID) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: "CheckoutRequestID is required." }) };
    }

    try {
      const { data: trackingData, error: trackingError } = await supabase
        .from('payment_tracking')
        .select('status, order_number')
        .eq('checkout_request_id', checkoutRequestID)
        .single();

      if (trackingError || !trackingData) {
        // If no record found yet, it's still pending
        return { statusCode: 200, headers, body: JSON.stringify({ status: 'pending' }) };
      }

      if (trackingData.status === 'paid') {
        const { data: finalOrder, error: orderError } = await supabase
          .from('paid_orders')
          .select('*')
          .eq('order_number', trackingData.order_number)
          .single();

        if (orderError || !finalOrder) {
          throw new Error(`Failed to fetch final order from Supabase: ${orderError ? orderError.message : 'Order not found'}`);
        }
        
        return { statusCode: 200, headers, body: JSON.stringify({ status: 'paid', finalOrder: finalOrder }) };
      
      } else if (trackingData.status === 'failed') {
        return { statusCode: 200, headers, body: JSON.stringify({ status: 'failed', message: 'Payment failed or was cancelled.' }) };
      } else {
        return { statusCode: 200, headers, body: JSON.stringify({ status: 'pending' }) };
      }
    } catch (error) {
      console.error("Error in /getPaymentStatus:", error.message);
      return { statusCode: 500, headers, body: JSON.stringify({ error: "Could not retrieve payment status." }) };
    }
  }

  // --- M-PESA CALLBACK ENDPOINT (Now updates Supabase) ---
  if (path === '/mpesaCallback') {
    const body = JSON.parse(event.body);
    console.log("M-Pesa Callback Received:", JSON.stringify(body, null, 2));
    
    const stkCallback = body.Body.stkCallback;
    if (!stkCallback) {
        return { statusCode: 200, headers, body: JSON.stringify({ message: "Invalid callback format." }) };
    }

    const checkoutRequestID = stkCallback.CheckoutRequestID;
    const resultCode = stkCallback.ResultCode;

    try {
        const { data: trackingData, error: trackingError } = await supabase
            .from('payment_tracking')
            .select('order_details, unpaid_order_id')
            .eq('checkout_request_id', checkoutRequestID)
            .single();

        if (trackingError || !trackingData) {
            console.error(`No tracking record found in Supabase for CheckoutRequestID: ${checkoutRequestID}`);
            return { statusCode: 200, headers, body: JSON.stringify({ ResultCode: 0, ResultDesc: "No matching record found" }) };
        }

        const { order_details: orderDetails, unpaid_order_id: unpaidOrderId } = trackingData;

        if (resultCode === 0) {
            // SUCCESS
            const metadata = stkCallback.CallbackMetadata.Item;
            const receiptItem = metadata.find(item => item.Name === "MpesaReceiptNumber");
            const mpesaReceipt = receiptItem ? receiptItem.Value : 'N/A';
            
            const finalOrder = {
                order_number: orderDetails.orderNumber,
                user_id: orderDetails.userId,
                full_name: orderDetails.fullName,
                phone: orderDetails.phone,
                address: orderDetails.address,
                items: orderDetails.items,
                total: orderDetails.total,
                payment_status: 'paid',
                mpesa_receipt_number: mpesaReceipt
            };

            const { error: insertError } = await supabase.from('paid_orders').insert([finalOrder]);
            if (insertError) throw new Error(`Supabase insert error: ${insertError.message}`);
            console.log(`Order ${finalOrder.order_number} saved to Supabase paid_orders.`);

            if (unpaidOrderId) {
                const { error: deleteError } = await supabase.from('unpaid_orders').delete().eq('id', unpaidOrderId);
                if (deleteError) throw new Error(`Supabase delete error: ${deleteError.message}`);
                console.log(`Unpaid order ${unpaidOrderId} deleted from Supabase.`);
            }
            
            // Update the tracking record status to 'paid'
            await supabase.from('payment_tracking').update({ status: 'paid' }).eq('checkout_request_id', checkoutRequestID);

        } else {
            // FAILURE
            // Update the tracking record status to 'failed'
            await supabase.from('payment_tracking').update({ status: 'failed' }).eq('checkout_request_id', checkoutRequestID);
        }
    } catch (error) {
        console.error("Error processing callback:", error);
        // We still return a 200 to M-Pesa, but log the internal error.
    }
    
    return { statusCode: 200, headers, body: JSON.stringify({ ResultCode: 0, ResultDesc: "Accepted" }) };
  }

  return {
    statusCode: 404,
    headers,
    body: 'Endpoint not found.'
  };
};
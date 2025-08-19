// netlify/functions/mpesa.js
// This version migrates the M-Pesa callback logic to Supabase.
// AMENDMENT: Added the /getPaymentStatus polling endpoint.

require('dotenv').config();
const axios = require("axios");
const admin = require("firebase-admin");
const { createClient } = require('@supabase/supabase-js');

// --- Supabase Admin Initialization ---
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// --- Firebase Admin Initialization (for temporary records) ---
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

// Production URLs
const tokenUrl = "https://api.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials";
const stkPushUrl = "https://api.safaricom.co.ke/mpesa/stkpush/v1/processrequest";
const stkPushQueryUrl = "https://api.safaricom.co.ke/mpesa/stkpushquery/v1/query";

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
      const mpesaResponse = await axios.post(stkPushUrl, payload, {
        headers: { "Authorization": `Bearer ${token}` },
      });
      
      const checkoutRequestID = mpesaResponse.data.CheckoutRequestID;
      console.log(`STK Push initiated. CheckoutRequestID: ${checkoutRequestID}`);

      const batch = db.batch();
      const pendingPaymentRef = db.collection('pending_payments').doc(checkoutRequestID);
      batch.set(pendingPaymentRef, {
          orderDetails: orderDetails,
          unpaidOrderId: unpaidOrderId || null, 
          timestamp: admin.firestore.FieldValue.serverTimestamp()
      });

      const publicStatusRef = db.collection('payment_status').doc(checkoutRequestID);
      batch.set(publicStatusRef, {
          status: 'pending',
          userId: orderDetails.userId,
          orderNumber: orderDetails.orderNumber // Store order number for easier lookup
      });

      await batch.commit();
      
      console.log(`Temporary records created for ${checkoutRequestID}`);
      
      return { statusCode: 200, headers, body: JSON.stringify({ checkoutRequestID: checkoutRequestID }) };

    } catch (error) {
      console.error("Error initiating STK push:", error.response ? error.response.data : error.message);
      return { statusCode: 500, headers, body: JSON.stringify({ error: "Failed to initiate M-Pesa payment." }) };
    }
  }
  
  // --- START: NEW POLLING ENDPOINT ---
  if (path === '/getPaymentStatus') {
    const { checkoutRequestID } = JSON.parse(event.body);

    if (!checkoutRequestID) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: "CheckoutRequestID is required." }) };
    }

    try {
      const publicStatusRef = db.collection('payment_status').doc(checkoutRequestID);
      const doc = await publicStatusRef.get();

      if (!doc.exists) {
        return { statusCode: 200, headers, body: JSON.stringify({ status: 'pending' }) };
      }

      const data = doc.data();

      if (data.status === 'paid') {
        // Payment is successful, fetch the final order from Supabase
        const { data: finalOrder, error } = await supabase
          .from('paid_orders')
          .select('*')
          .eq('order_number', data.orderNumber)
          .single(); // Use single() as order_number should be unique

        if (error || !finalOrder) {
          throw new Error(`Failed to fetch final order from Supabase: ${error ? error.message : 'Order not found'}`);
        }
        
        return { statusCode: 200, headers, body: JSON.stringify({ status: 'paid', finalOrder: finalOrder }) };
      
      } else if (data.status === 'failed') {
        return { statusCode: 200, headers, body: JSON.stringify({ status: 'failed', message: data.reason || 'Payment failed' }) };
      } else {
        return { statusCode: 200, headers, body: JSON.stringify({ status: 'pending' }) };
      }
    } catch (error) {
      console.error("Error in /getPaymentStatus:", error.message);
      return { statusCode: 500, headers, body: JSON.stringify({ error: "Could not retrieve payment status." }) };
    }
  }
  // --- END: NEW POLLING ENDPOINT ---


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
        const pendingPaymentRef = db.collection('pending_payments').doc(checkoutRequestID);
        const publicStatusRef = db.collection('payment_status').doc(checkoutRequestID);
        
        const pendingPaymentDoc = await pendingPaymentRef.get();

        if (!pendingPaymentDoc.exists) {
            console.error(`No pending payment record found for CheckoutRequestID: ${checkoutRequestID}`);
            return { statusCode: 200, headers, body: JSON.stringify({ ResultCode: 0, ResultDesc: "No matching record found" }) };
        }

        const { orderDetails, unpaidOrderId } = pendingPaymentDoc.data();

        if (resultCode === 0) {
            // SUCCESS
            console.log(`Payment successful for CheckoutRequestID: ${checkoutRequestID}`);
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
            console.log(`Order ${finalOrder.order_number} saved to Supabase.`);

            if (unpaidOrderId) {
                const { error: deleteError } = await supabase.from('unpaid_orders').delete().eq('id', unpaidOrderId);
                if (deleteError) throw new Error(`Supabase delete error: ${deleteError.message}`);
                console.log(`Unpaid order ${unpaidOrderId} deleted from Supabase.`);
            }
            
            await publicStatusRef.set({ status: 'paid' }, { merge: true });

        } else {
            // FAILURE
            console.log(`Payment failed for CheckoutRequestID: ${checkoutRequestID}. Reason: ${resultDesc}`);
            await publicStatusRef.set({ status: 'failed', reason: resultDesc }, { merge: true });
        }
    } catch (error) {
        console.error("Error processing callback:", error);
        return { statusCode: 500, headers, body: JSON.stringify({ message: "Internal server error." }) };
    } finally {
        const pendingPaymentRef = db.collection('pending_payments').doc(checkoutRequestID);
        await pendingPaymentRef.delete();
    }
    
    return { statusCode: 200, headers, body: JSON.stringify({ ResultCode: 0, ResultDesc: "Accepted" }) };
  }

  return {
    statusCode: 404,
    headers,
    body: 'Endpoint not found.'
  };
};
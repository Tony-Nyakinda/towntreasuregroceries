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

    if (!phone || !amount || !orderDetails || !unpaidOrderId) {
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
          unpaidOrderId: unpaidOrderId, // <-- KEY CHANGE: Store the original ID
          timestamp: admin.firestore.FieldValue.serverTimestamp()
      });

      const publicStatusRef = db.collection('payment_status').doc(checkoutRequestID);
      batch.set(publicStatusRef, {
          status: 'pending',
          userId: orderDetails.userId
      });

      await batch.commit();
      
      console.log(`Temporary records created for ${checkoutRequestID}`);
      
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
        const pendingPaymentRef = db.collection('pending_payments').doc(checkoutRequestID);
        const publicStatusRef = db.collection('payment_status').doc(checkoutRequestID);
        
        const pendingPaymentDoc = await pendingPaymentRef.get();

        if (!pendingPaymentDoc.exists) {
            console.error(`No pending payment record found for CheckoutRequestID: ${checkoutRequestID}`);
            return { statusCode: 200, headers, body: JSON.stringify({ ResultCode: 0, ResultDesc: "No matching record found" }) };
        }

        const { orderDetails, unpaidOrderId } = pendingPaymentDoc.data(); // <-- KEY CHANGE: Retrieve the ID

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
            
            orderDetails.timestamp = admin.firestore.FieldValue.serverTimestamp();

            // Define references for the final paid order and the original unpaid order
            const finalOrderRef = db.collection(`artifacts/default-app-id/public/data/orders`).doc(orderDetails.orderNumber);
            const unpaidOrderRef = db.collection(`artifacts/default-app-id/public/data/unpaid_orders`).doc(unpaidOrderId);

            // KEY CHANGE: Use a batch write to create the new order and delete the old one
            const successBatch = db.batch();
            successBatch.set(finalOrderRef, orderDetails);
            successBatch.delete(unpaidOrderRef);
            await successBatch.commit();
            
            console.log(`Order ${orderDetails.orderNumber} saved and unpaid order ${unpaidOrderId} deleted.`);
            
            // Send back success response to polling client
            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({
                    status: 'paid',
                    finalOrder: orderDetails,
                    message: "Payment successful"
                })
            };

        } else {
            // FAILURE
            console.log(`Payment failed for CheckoutRequestID: ${checkoutRequestID}. Reason: ${resultDesc}`);
            
            // Send back a failure response to the polling client.
            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({
                    status: 'failed',
                    reason: resultDesc,
                    message: "Payment failed"
                })
            };
        }
    } catch (error) {
        console.error("Error processing callback:", error);
        return { statusCode: 500, headers, body: JSON.stringify({ message: "Internal server error." }) };
    } finally {
        // Clean up the secure temporary record regardless of success or failure
        const pendingPaymentRef = db.collection('pending_payments').doc(checkoutRequestID);
        await pendingPaymentRef.delete();
        const publicStatusRef = db.collection('payment_status').doc(checkoutRequestID);
        await publicStatusRef.delete();
    }
  }

  // --- Endpoint to POLL FOR PAYMENT STATUS ---
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

        if (resultCode === "0") {
            const finalOrderRef = db.collection(`artifacts/default-app-id/public/data/orders`).doc(checkoutRequestID);
            const finalOrderDoc = await finalOrderRef.get();

            if (finalOrderDoc.exists) {
                return {
                    statusCode: 200,
                    headers,
                    body: JSON.stringify({
                        status: 'paid',
                        finalOrder: finalOrderDoc.data(),
                        message: "Payment successful!"
                    })
                };
            } else {
                return { statusCode: 200, headers, body: JSON.stringify({ status: 'pending', message: "Payment successful, but order is still processing." }) };
            }

        } else if (resultCode === "1032") {
            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({
                    status: 'cancelled',
                    message: "Transaction cancelled by user."
                })
            };
        } else if (resultCode === "2001") {
            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({
                    status: 'failed',
                    message: mpesaResponse.data.ResultDesc
                })
            };
        }
        else {
          return {
              statusCode: 200,
              headers,
              body: JSON.stringify({
                  status: 'pending',
                  message: mpesaResponse.data.ResultDesc
              })
          };
        }
    } catch (error) {
        console.error("Error checking payment status:", error.response ? error.response.data : error.message);
        return { statusCode: 500, headers, body: JSON.stringify({ error: "Failed to check payment status." }) };
    }
  }

  return {
    statusCode: 404,
    headers,
    body: 'Endpoint not found.'
  };
};

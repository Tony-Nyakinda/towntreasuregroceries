// netlify/functions/verify-receipt.js
// This function securely checks if an order number exists in the database
// without returning any sensitive order details.
//....

const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase client with the service role key for admin-level access
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

exports.handler = async function (event) {
  // Only allow POST requests
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const { orderNumber } = JSON.parse(event.body);

    if (!orderNumber) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Order Number is required.' }) };
    }

    // Check in paid_orders table
    const { data: paidOrder, error: paidError } = await supabase
      .from('paid_orders')
      .select('id') // We only need to know if it exists
      .eq('order_number', orderNumber)
      .single();

    if (paidOrder) {
      return { statusCode: 200, body: JSON.stringify({ genuine: true }) };
    }

    // If not found, check in unpaid_orders table
    const { data: unpaidOrder, error: unpaidError } = await supabase
      .from('unpaid_orders')
      .select('id')
      .eq('order_number', orderNumber)
      .single();

    if (unpaidOrder) {
      return { statusCode: 200, body: JSON.stringify({ genuine: true }) };
    }

    // If not found in either table
    return { statusCode: 200, body: JSON.stringify({ genuine: false }) };

  } catch (error) {
    console.error('Error in verify-receipt function:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'An internal server error occurred.' }),
    };
  }
};

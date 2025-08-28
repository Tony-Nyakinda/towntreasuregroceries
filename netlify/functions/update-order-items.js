// netlify/functions/update-order-items.js
// This function securely updates the items in an unpaid order.

const { createClient } = require('@supabase/supabase-js');
const admin = require('firebase-admin');

// Initialize Firebase Admin SDK to verify user identity
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY))
  });
}

// --- REAL-WORLD DELIVERY FEE LOGIC (from delivery-zones.js) ---
const zones = {
    "Zone 1": [
        "Westlands", "Parklands", "Highridge", "Muthaiga", "Ngara", "Pangani", 
        "Gigiri", "Kitisuru", "Kyuna", "Loresho", "Spring Valley", "Upper Hill"
    ],
    "Zone 2": [
        "Lavington", "Kilimani", "Kileleshwa", "Hurlingham", "Eastleigh", "South C", 
        "Nairobi West", "South B", "Madaraka Estate", "Jericho", "Kaloleni", "Makadara",
        "Muthangari", "Woodley"
    ],
    "Zone 3": [
        "Embakasi", "Donholm", "Umoja", "Kayole", "Komarock", "Roysambu", "Kasarani", 
        "Kahawa", "Dandora", "Embakasi Pipeline", "Imara Daima", "Nyayo Estate", 
        "Pipeline", "Ruaraka", "Thome", "Lucky Summer", "Mwiki", "Njiru", "Pumwani",
        "Shauri Moyo", "Ziwani"
    ],
    "Zone 4": [
        "Lang'ata", "Karen", "Rongai", "Githurai", "Zimmerman", "Ruiru", "Juja", 
        "Kikuyu", "Dagoretti", "Kawangware", "Uthiru", "Waithaka", "Riruta Satellite", 
        "Ng'ando", "Mountain View", "Mugumoini", "Mutuini"
    ],
    "Zone 5": [
        "Kitengela", "Syokimau", "Mlolongo", "Athi River", "Utawala", "Ruai", "Kamulu"
    ],
    "Zone 6": [
        "Thika", "Machakos", "Ngong", "Kiserian", "Limuru", "Kiambu"
    ],
    "Zone 7": [
              "Test"
    ],          
    "Slums": [
        "Bahati", "Buruburu", "Gatwekera", "Huruma", "Kambi Muru", "Kiambiu", "Kibera",
        "Kichinjio", "Kisumu Ndogo", "Korogocho", "Kware", "Laini Saba", "Lindi",
        "Majengo", "Marurui", "Mashimoni", "Mathare", "Mathare Valley", "Matopeni",
        "Mihang'o", "Muirigo", "Mukuru kwa Njenga", "Mukuru slums", "Ofafa", "Raila",
        "Sarang'ombe", "Shilanga", "Siranga", "Soweto East", "Soweto West"
    ]
};

const zoneFees = {
    "Zone 1": 150,
    "Zone 2": 250,
    "Zone 3": 350,
    "Zone 4": 450,
    "Zone 5": 600,
    "Zone 6": 800,
    "Zone 7": 0,
    "Slums": 200, 
};

const defaultFee = 500;

function getDeliveryFee(address) {
    if (!address || address.trim() === '') {
        return 0;
    }
    const lowerCaseAddress = address.toLowerCase();

    for (const zone in zones) {
        for (const location of zones[zone]) {
            if (lowerCaseAddress.includes(location.toLowerCase())) {
                return zoneFees[zone];
            }
        }
    }
    return defaultFee;
}
// --- END OF DELIVERY FEE LOGIC ---


exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    // --- User Authentication ---
    const idToken = event.headers.authorization.split('Bearer ')[1];
    if (!idToken) {
      return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
    }
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    const uid = decodedToken.uid;

    // --- Logic ---
    const { orderId, itemIdToRemove } = JSON.parse(event.body);
    if (!orderId || !itemIdToRemove) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Order ID and Item ID are required.' }) };
    }

    // Initialize Supabase with Service Role Key for secure backend operations
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // 1. Fetch the specific order to ensure it belongs to the user
    const { data: order, error: fetchError } = await supabase
      .from('unpaid_orders')
      .select('*')
      .eq('id', orderId)
      .eq('user_id', uid) // Security check
      .single();

    if (fetchError || !order) {
      return { statusCode: 404, body: JSON.stringify({ error: 'Order not found or you do not have permission to edit it.' }) };
    }

    // 2. Filter out the item to be removed
    const initialItems = Array.isArray(order.items) ? order.items : [];
    const newItems = initialItems.filter(item => item.id.toString() !== itemIdToRemove.toString());

    // If all items are removed, the order should be cancelled instead.
    if (newItems.length === 0) {
        return { 
            statusCode: 400, 
            body: JSON.stringify({ 
                error: 'Cannot remove the last item. Please cancel the order instead.',
                action: 'cancel' 
            }) 
        };
    }

    // 3. Recalculate totals using the correct delivery fee logic
    const newSubtotal = newItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const deliveryFee = getDeliveryFee(order.address);
    const newTotal = newSubtotal + deliveryFee;

    // 4. Update the order in the database
    const { data: updatedOrder, error: updateError } = await supabase
      .from('unpaid_orders')
      .update({ items: newItems, total: newTotal, delivery_fee: deliveryFee })
      .eq('id', orderId)
      .select()
      .single();

    if (updateError) {
      throw updateError;
    }

    return {
      statusCode: 200,
      body: JSON.stringify(updatedOrder),
    };

  } catch (error) {
    console.error('Error in update-order-items function:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message || 'An internal server error occurred.' }),
    };
  }
};

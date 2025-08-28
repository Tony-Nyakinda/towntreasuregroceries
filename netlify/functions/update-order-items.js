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
        "1th Parklands Avenue", "2th Parklands Avenue", "3th Parklands Avenue", "4th Parklands Avenue",
        "5th Parklands Avenue", "6th Parklands Avenue", "7th Parklands Avenue", "8th Parklands Avenue",
        "9 West", "9th Parklands Avenue", "10th Parklands Avenue", "11th Parklands Avenue", "12th Parklands Avenue",
        "ABC Place", "Aga Khan University Hospital", "Ambassadeur", "Arboretum", "Avenue Hospital Parklands",
        "Brookside Drive", "CBD", "Central Business District", "Chiromo", "Chiromo Road", "City Hall Way",
        "City Market", "Community Area", "Delta Towers", "Eden Square", "General Mathenge Drive", "Gertrude's Children's Hospital (Muthaiga)",
        "Gigiri", "Globe Roundabout", "GTC Westlands", "Haile Selassie Avenue", "Harambee Avenue", "High Court",
        "Highridge", "Ihub Senteu Plaza", "Kandara Road", "Kangemi", "KICC", "Kencom House", "Kenya High School",
        "Kenyatta Avenue", "Kenyatta Avenue Roundabout", "Kenyatta National Hospital (Upper Hill)", "Kimathi Street",
        "Kipande Road", "Kitisuru", "Kyuna", "Lavington Mall", "Loresho", "Macmillan Library", "Mama Ngina Street",
        "Milimani Law Courts", "Moi Avenue", "MP Shah Hospital", "Muindi Mbingu Street", "Museum Hill", "Museum Hill Interchange (CBD)",
        "Muthaiga", "Nairobi Arboretum Park", "Nairobi CBD", "Nairobi Gallery", "Nairobi Hospital", "Nairobi National Museum",
        "National Museums of Kenya", "Ngara", "Ojijo Plaza", "Ojijo Road", "One Africa Place", "Pangani", "Parklands",
        "Parliament Buildings", "Peponi Gardens", "Peponi Road", "Rhapta Road", "Ring Road Parklands", "Ring Road Westlands",
        "River Road", "Riverside", "Riverside Drive", "Ronald Ngala Street", "Sarit Centre", "School Lane", "Spring Valley",
        "St. Mark Church Westlands", "St. Mary's School Nairobi", "State House", "State House Girls", "State House Road",
        "Supreme Court", "The Mall Westlands", "The Mirage", "Tom Mboya Street", "Uhuru Highway (CBD)",
        "University of Nairobi Main Campus", "University Way", "Upper Hill", "Waiyaki Way", "Wambugu Road", "Westgate Mall",
        "Westlands", "Yaya Centre (Westlands side)"
    ],
    "Zone 2": [
        "1th Avenue Eastleigh", "1th Street Eastleigh", "2th Avenue Eastleigh", "2th Street Eastleigh", "3th Avenue Eastleigh",
        "3th Street Eastleigh", "4th Avenue Eastleigh", "4th Street Eastleigh", "5th Avenue Eastleigh", "5th Street Eastleigh",
        "6th Avenue Eastleigh", "6th Street Eastleigh", "7th Avenue Eastleigh", "7th Street Eastleigh", "8th Avenue Eastleigh",
        "8th Street Eastleigh", "9th Avenue Eastleigh", "9th Street Eastleigh", "10th Avenue Eastleigh", "10th Street Eastleigh",
        "11th Avenue Eastleigh", "11th Street Eastleigh", "12th Avenue Eastleigh", "12th Street Eastleigh", "Adams Arcade",
        "Aga Khan High School (Parklands edge)", "Akiba", "Argwings Kodhek Road", "Bellevue (South C)", "Capital Centre (South B)",
        "Chania Avenue", "Coptic Hospital", "Daystar University Valley Road Campus", "Dennis Pritt Road", "Eastleigh",
        "Eastleigh Section 1", "Eastleigh Section 2", "Eastleigh Section 3", "Elgeyo Marakwet Road", "Fifth Avenue Eastleigh",
        "First Avenue Eastleigh", "Fourth Avenue Eastleigh", "General Waruinge Street", "Gikomba Market", "Gitanga Road",
        "Harambee Estate", "Hurlingham", "Imara Estate (South C)", "Jam Street Eastleigh", "James Gichuru Road", "Jericho",
        "Junction Mall", "Kaloleni", "Kenya School of Law", "Kileleshwa", "Kilimani",
        "Kirichwa Road", "KPA Estate", "Lavington", "Lavington Green", "Lenana Road", "Madaraka Estate",
        "Madaraka Shopping Centre", "Makadara", "Matter Hospital (South B)", "Maziwa Road", "Mugoya", "Mukuru South B",
        "Muthangari", "Nairobi West", "Ngong Road (Kilimani)", "Nyayo Stadium", "Ole Odume Road", "Othaya Road", "Plan 204",
        "Plainsview", "Prestige Plaza", "Pumwani Maternity", "Riara University", "Ring Road Kileleshwa", "Ring Road Kilimani",
        "Rose Avenue", "Rusinga School (Kilimani)", "Second Avenue Eastleigh", "Seventh Street Eastleigh", "Shauri Moyo",
        "South B", "South B Sector A", "South B Sector B", "South B Sector C", "South B Sector D", "South B Sector E",
        "South B Sector F", "South B Sector G", "South B Sector H", "South B Sector I", "South B Sector J", "South B Sector K",
        "South B Sector L", "South B Sector M", "South B Sector N", "South B Sector O", "South B Sector P", "South B Sector Q",
        "South B Sector R", "South B Sector S", "South B Sector T", "South B Sector U", "South B Sector V", "South B Sector W",
        "South B Sector X", "South B Sector Y", "South B Sector Z", "South C", "South C Court A", "South C Court B",
        "South C Court C", "South C Court D", "South C Court E", "South C Court F", "South C Court G", "South C Court H",
        "South C Court I", "South C Court J", "South C Court K", "South C Court L", "South C Court M", "South C Court N",
        "South C Court O", "South C Court P", "South C Court Q", "South C Court R", "South C Court S", "South C Court T",
        "South C Court U", "South C Court V", "South C Court W", "South C Court X", "South C Court Y", "South C Court Z",
        "St. Hannah's School", "Strathmore University (Madaraka)", "Strathmore University Business School (Madaraka)",
        "T-Mall", "Third Avenue Eastleigh", "Timbwani", "Woodley", "Yaya Centre"
    ],
    "Zone 3": [
        "ABC Place Interchange", "Addis Ababa Road", "Allsops", "Allsops Interchange", "Athi River Road (Industrial Area)",
        "Aviation Estate", "Baba Dogo", "Baba Dogo Road", "Babas Shopping Complex Umoja", "Baricho Road", "Bunyala Road (Industrial)",
        "Buruburu Phase 1", "Buruburu Phase 2", "Buruburu Phase 3", "Buruburu Phase 4", "Buruburu Phase 5",
        "City Cabanas", "City Stadium Roundabout", "Clay City", "Dagoretti Road", "Dandora", "Dandora Phase 1",
        "Dandora Phase 2", "Dandora Phase 3", "Dandora Phase 4", "Dandora Phase 5", "Dar es Salaam Road", "Donholm",
        "Drive-In Estate", "Eastern Bypass", "Embakasi", "Embakasi Pipeline", "Enterprise Road", "Factory Street",
        "Fedha Estate", "Forest Road", "GM Roundabout", "Garden City Mall", "Gitaru Interchange", "Githurai 44",
        "Githurai 45", "Greenspan Mall Donholm", "Haile Selassie Roundabout", "Homeland Ruaraka", "ICD Embakasi",
        "Imara Daima", "Inland Container Depot", "James Gichuru Road", "JKUAT Karen", "Jogoo Road",
        "Jogoo Road Makadara", "Kahawa", "Kahawa Sukari", "Kahawa Wendani", "Kahawa West", "Kamburu Drive",
        "Kampala Road", "Kangundo Road", "Kapenguria Road", "Kariobangi North", "Kariobangi South", "Kasarani",
        "Kasarani Hunters", "Kasarani Mwiki", "Kasarani Mwiki Road", "Kasarani Sportsview", "Kasarani Seasons",
        "Kayole", "Kayole Junction", "Kayole Sabasaba", "Kayole Soweto", "KCA University", "KCA University Ruaraka",
        "Kenyatta University", "Kikuyu Road", "Kitui Road", "Komarock", "Komarock Phase 1",
        "Komarock Phase 2", "Komarock Phase 3", "Lang'ata Road", "Likoni Road", "Limuru Road", "Lucky Summer",
        "Lunga Lunga Road", "Magadi Road", "Mama Lucy Kibaki Hospital", "Mathare North", "Mombasa Road",
        "Mukuru kwa Njenga", "Mukuru kwa Reuben", "Museum Hill Interchange", "Muthaiga North", "Mwiki", "Naivas Embakasi",
        "Naivasha Road", "Nairobi South A", "Nairobi South B (Industrial Area)", "Nanyuki Road", "Ngong Road", "Njiru",
        "Northern Bypass", "Nyayo Estate", "Nyayo Stadium Roundabout", "Outering Road", "Outering Taj Mall", "Pipeline",
        "Pumwani", "Ring Road Ngara", "Roasters", "Roysambu", "Roysambu Roundabout", "Roysambu USIU", "Ruaraka",
        "Ruaraka Biashara", "Sabaki (Embakasi)", "Sameer Park", "Santack Road", "Savannah Estate",
        "Savannah High School", "Seasons Stage", "Shauri Moyo", "Shimo La Tewa Road", "Southern Bypass", "Sunton",
        "Tassia", "Tena Estate", "Thika Superhighway", "Thome", "TRM Mall", "Umoja", "Umoja 1", "Umoja 2", "Umoja 3",
        "Umoja 4", "Umoja Innercore", "Umoja Outer Ring", "USIU Africa (Kasarani)", "Waiyaki Way", "Ziwani"
    ],
    "Zone 4": [
        "87 (Dagoretti)", "Bomas of Kenya", "Bomas Roundabout", "Bomas Junction", "Brookhouse School (Karen)", "Carnivore Grounds",
        "Dagoretti", "Dagoretti Corner", "Forest Edge (Karen)", "Galleria Mall", "Gitaru", "Githurai", "Hillcrest International School",
        "Kabiria", "Karen", "Karen Blixen Coffee Garden", "Karen Blixen Museum", "Karen Crossroads", "Karen Hardy",
        "Karen Hardy Junction", "Karen Hospital", "Karen Plains", "Karen Road", "Kawangware", "Kawangware 46", "Kikuyu",
        "Kikuyu Kamangu", "Kikuyu Town", "Kinoo", "Kiserian", "Lang'ata", "Langata Barracks", "Langata Cemetery",
        "Langata NHC", "Langata Southlands", "Loresho Ridge", "Miotoni", "Mountain View", "Muguga (Kikuyu)",
        "Mugumoini", "Muthangari North", "Muti-ini", "Mutuini", "Ndeiya (Kikuyu)", "Ndumboini", "Ngecha",
        "Ng'ando", "Ngong Racecourse", "Ngong Racecourse & Golf Park", "Ngong Road (Karen)", "Nyayo Highrise",
        "Ongata Rongai", "Otiende", "Riruta Satellite", "Riruta Shopping Centre", "Rongai", "Ruiru", "Juja",
        "Southlands Estate", "St. Hannah's School Dagoretti", "St. Mary's Sports Grounds (Karen)", "St. Nicholas School Karen",
        "The Hub Karen", "Thogoto", "Uthiru", "Uthiru Muthua", "Waithaka", "Wanyee Road", "Wilson Airport", "Zambezi (Kikuyu)",
        "Zimmerman"
    ],
    "Zone 5": [
        "Airport North Road", "Airport South Road", "Athi River", "Athi River EPZ", "Athi River EPZ Gate", "Chokaa",
        "Embakasi Cargo", "Gateway Mall", "Githunguri (Utawala)", "Githunguri Farm", "Githunguri Ruai", "Harambee Sacco Estate",
        "JKIA", "JKIA Terminal 1A", "JKIA Terminal 1B", "JKIA Terminal 1C", "JKIA Terminal 2", "Joska",
        "Juja Farm", "Kamulu", "Kamulu Police Station", "Kamulu Shopping Centre", "Katani", "KBC Ruai",
        "Kitengela", "Kwa Njenga River Bank", "Makongeni Thika", "Mitikenda", "Mlolongo", "Mlolongo Weighbridge",
        "Njiru Shopping Centre", "Roma Stage (Ruai)", "Ruai", "Ruai Police", "Ruai Police Station", "Sabaki Mlolongo",
        "Sewage Estate", "SGR Nairobi Terminus", "Syokimau", "Syokimau Railway Station", "Tala", "Utawala",
        "Utawala Airbase", "Utawala Benedicta"
    ],
    "Zone 6": [
        "Banana", "Banana Hill", "Boma Estate Ruaka", "Gachie Shopping Centre", "Gatundu", "Kahawa Barracks",
        "Karura", "Karura Forest Gate Ruaka", "Kiambu", "Kiserian", "Limuru",
        "Limuru Road Ndenderu", "Machakos", "Muchatha", "Ndenderu", "Ngecha", "Ngong", "Ruaka", "Ruiru Bypass",
        "Rwaka", "Tatu City", "Thika", "Tigoni", "Tigoni Tea Estates",
        "Two Rivers Mall", "Village Market"
    ],
    "Zone 7": [
        "Test"
    ],
    "Slums": [
        "Bahati", "Buruburu", "Gatwekera", "Huruma", "Kambi Muru", "Kiambiu", "Kibera", "Kibera DC",
        "Kibera Katwekera", "Kibera Kianda", "Kibera Lindi", "Kibera Makina", "Kibera Olympic", "Kibera Silanga",
        "Kichinjio", "Kisumu Ndogo", "Korogocho", "Korogocho Gitathuru", "Korogocho Grogan A", "Korogocho Grogan B",
        "Korogocho Highridge", "Korogocho Kisumu Ndogo", "Korogocho Nyayo", "Kware", "Laini Saba", "Lindi",
        "Majengo", "Marurui", "Mashimoni", "Mathare", "Mathare Valley", "Matopeni", "Mihang'o", "Muirigo",
        "Mukuru kwa Njenga", "Mukuru kwa Reuben", "Mukuru slums", "Mukuru Viwandani", "Ofafa", "Raila",
        "Sarang'ombe", "Shilanga", "Siranga", "Soweto East", "Soweto West", "Viwandani"
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

const defaultFee = 0;

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

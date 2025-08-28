// delivery-zones.js

// This file contains a static list of delivery locations in Nairobi and its environs,
// categorized into zones with corresponding fees. This allows for predictable pricing
// based on the customer's stated delivery area.

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

// A mapping of each zone to its specific delivery fee.
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

// A default fee for any location that is not found in our predefined zones.
// This ensures that every customer gets a quote.
const defaultFee = 0;

/**
 * Calculates the delivery fee based on a user-provided address.
 * It searches for keywords from the address in our static zone list.
 * @param {string} address - The delivery address entered by the user.
 * @returns {number} The calculated delivery fee. Returns 0 if no address is provided.
 */
export function getDeliveryFee(address) {
    // If the address is empty or just whitespace, return a fee of 0.
    if (!address || address.trim() === '') {
        return 0;
    }
    const lowerCaseAddress = address.toLowerCase();

    // Iterate through each zone and its associated locations.
    for (const zone in zones) {
        for (const location of zones[zone]) {
            // If the user's address includes a known location, return the fee for that zone.
            if (lowerCaseAddress.includes(location.toLowerCase())) {
                return zoneFees[zone];
            }
        }
    }

    // If no match is found after checking all zones, return the default fee.
    return defaultFee;
}

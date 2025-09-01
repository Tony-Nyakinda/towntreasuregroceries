// delivery-zones.js
// This file contains corrected and logically reorganized delivery zones for Nairobi.
// The original file had many locations in incorrect zones, likely due to programmatic generation.
// This version moves distant locations to the appropriate higher-fee zones and removes duplicates.

const zones = {
  "Zone 1": [
    "1th Parklands Avenue", "2th Parklands Avenue", "3th Parklands Avenue", "4th Parklands Avenue",
    "5th Parklands Avenue", "6th Parklands Avenue", "7th Parklands Avenue", "8th Parklands Avenue",
    "9 West", "9th Parklands Avenue", "10th Parklands Avenue", "11th Parklands Avenue", "12th Parklands Avenue",
    "ABC Place", "Aga Khan University Hospital", "Ambassadeur", "Arboretum", "Avenue Hospital Parklands",
    "Brookside Drive", "CBD", "Central Business District", "Chiromo", "Chiromo Road", "City Hall Way",
    "City Market", "Community Area", "Delta Towers", "Eden Square", "General Mathenge Drive", "Gertrude's Children's Hospital (Muthaiga)",
    "Gigiri", "Globe Roundabout", "GTC Westlands", "Haile Selassie Avenue", "Harambee Avenue", "High Court",
    "Highridge", "Ihub Senteu Plaza", "Kandara Road", "KICC", "Kencom House", "Kenya High School",
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
    "Westlands", "Yaya Centre (Westlands side)", "OTC", "OTC Market", "Highridge Drive", "Loresho Plaza", "Parklands Crossing",
    "Kitisuru Close", "Westlands Road", "Gigiri View", "Westlands Plaza 14", "Gigiri Phase 184"
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
    "Hurlingham", "Imara Estate (South C)", "Jam Street Eastleigh", "James Gichuru Road",
    "Junction Mall", "Kaloleni", "Kenya School of Law", "Kileleshwa", "Kilimani",
    "Kirichwa Road", "KPA Estate", "Lavington", "Lavington Green", "Lenana Road", "Madaraka Estate",
    "Madaraka Shopping Centre", "Matter Hospital (South B)", "Maziwa Road",
    "Nairobi West", "Ngong Road (Kilimani)", "Nyayo Stadium", "Ole Odume Road", "Othaya Road", "Plan 204",
    "Plainsview", "Prestige Plaza", "Pumwani Maternity", "Riara University", "Ring Road Kileleshwa", "Ring Road Kilimani",
    "Rose Avenue", "Rusinga School (Kilimani)", "Second Avenue Eastleigh", "Seventh Street Eastleigh",
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
    "T-Mall", "Third Avenue Eastleigh", "Timbwani", "Woodley", "Yaya Centre", "Kileleshwa Phase 27", "Madaraka Drive",
    "Lavington Close 24", "Pangani Junction 7", "Woodley Phase 187", "Junction Mall Heights", "Shauri Moyo", "Shauri Moyo Crossing",
    "Bahati"
  ],
  "Zone 3": [
    "ABC Place Interchange", "Addis Ababa Road", "Allsops", "Allsops Interchange", "Athi River Road (Industrial Area)",
    "Baba Dogo", "Baba Dogo Road", "Babas Shopping Complex Umoja", "Baricho Road", "Bunyala Road (Industrial)",
    "Buruburu Phase 1", "Buruburu Phase 2", "Buruburu Phase 3", "Buruburu Phase 4", "Buruburu Phase 5", "Buruburu", "Buruburu Bypass",
    "City Cabanas", "City Stadium Roundabout", "Clay City", "Dandora", "Dandora Phase 1", "Dandora Phase 2",
    "Dandora Phase 3", "Dandora Phase 4", "Dandora Phase 5", "Dar es Salaam Road", "Donholm",
    "Drive-In Estate", "Eastern Bypass", "Embakasi", "Embakasi Pipeline", "Enterprise Road", "Factory Street",
    "Fedha Estate", "Forest Road", "GM Roundabout", "Garden City Mall", "Greenspan Mall Donholm", "Haile Selassie Roundabout",
    "Homeland Ruaraka", "ICD Embakasi", "Imara Daima", "Inland Container Depot", "Jogoo Road", "Jogoo Road Makadara",
    "Kahawa", "Kahawa Sukari", "Kahawa Wendani", "Kahawa West", "Kamburu Drive", "Kampala Road", "Kangundo Road", "Kapenguria Road",
    "Kariobangi North", "Kariobangi South", "Kasarani", "Kasarani Hunters", "Kasarani Mwiki", "Kasarani Mwiki Road",
    "Kasarani Sportsview", "Kasarani Seasons", "Kayole", "Kayole Junction", "Kayole Sabasaba", "Kayole Soweto", "Kayole Drive",
    "KCA University", "KCA University Ruaraka", "Kenyatta University", "Kitui Road", "Komarock", "Komarock Phase 1",
    "Komarock Phase 2", "Komarock Phase 3", "Likoni Road", "Lucky Summer", "Lunga Lunga Road",
    "Mama Lucy Kibaki Hospital", "Mathare North", "Mombasa Road", "Muthaiga North", "Mwiki", "Naivas Embakasi",
    "Nairobi South A", "Nairobi South B (Industrial Area)", "Nanyuki Road", "Njiru", "Northern Bypass", "Nyayo Estate", "Nyayo Estate Plaza",
    "Nyayo Stadium Roundabout", "Outering Road", "Outering Taj Mall", "Pipeline", "Pumwani", "Ring Road Ngara", "Roasters",
    "Roysambu", "Roysambu Roundabout", "Roysambu USIU", "Ruaraka", "Ruaraka Biashara", "Sabaki (Embakasi)", "Sameer Park",
    "Santack Road", "Savannah Estate", "Savannah High School", "Seasons Stage", "Shimo La Tewa Road", "Sunton", "Tassia",
    "Tena Estate", "Thika Superhighway", "Thome", "Thome Junction", "TRM Mall", "Umoja", "Umoja 1", "Umoja 2", "Umoja 3",
    "Umoja 4", "Umoja Innercore", "Umoja Outer Ring", "USIU Africa (Kasarani)", "Ziwani", "Imara Daima Close 489", "Donholm Road",
    "Makadara Junction", "Jogoo Road Terminal", "TRM Mall Road", "Umoja Crossing 468"
  ],
  "Zone 4": [
    "87 (Dagoretti)", "Bomas of Kenya", "Bomas Roundabout", "Bomas Junction", "Dagoretti", "Dagoretti Corner",
    "Galleria Mall", "Gitaru", "Kabiria", "Karen", "Karen Blixen Coffee Garden", "Karen Blixen Museum",
    "Karen Crossroads", "Karen Hardy", "Karen Hardy Junction", "Karen Hospital", "Karen Plains", "Karen Road",
    "Kawangware", "Kawangware 46", "Kikuyu Road", "Kinoo", "Lang'ata", "Langata Barracks", "Langata Cemetery",
    "Langata NHC", "Langata Southlands", "Loresho Ridge", "Mountain View", "Muthangari North", "Mutuini", "Ngecha",
    "Ng'ando", "Ngong Racecourse", "Ngong Racecourse & Golf Park", "Ngong Road (Karen)", "Nyayo Highrise",
    "Otiende", "Riruta Satellite", "Riruta Shopping Centre", "Southlands Estate", "St. Hannah's School Dagoretti",
    "The Hub Karen", "Uthiru", "Uthiru Muthua", "Waithaka", "Wanyee Road", "Wilson Airport", "Zimmerman",
    "Galleria Estate 25", "Karen Junction", "Lang'Ata South 96", "Ngong Road Stop", "Githurai", "Githurai 44", "Githurai 45",
    "Githurai Park", "Kangemi"
  ],
  "Zone 5": [
    "Airport North Road", "Airport South Road", "Athi River", "Athi River EPZ", "Athi River EPZ Gate", "Chokaa",
    "Embakasi Cargo", "Gateway Mall", "Githunguri (Utawala)", "Githunguri Farm", "Githunguri Ruai", "Harambee Sacco Estate",
    "JKIA", "JKIA Terminal 1A", "JKIA Terminal 1B", "JKIA Terminal 1C", "JKIA Terminal 2", "Joska",
    "Kamulu", "Kamulu Police Station", "Kamulu Shopping Centre", "Katani", "KBC Ruai", "Kitengela",
    "Kwa Njenga River Bank", "Mlolongo", "Mlolongo Weighbridge", "Njiru Shopping Centre",
    "Ongata Rongai", "Roma Stage (Ruai)", "Rongai", "Ruai", "Ruai Police", "Ruai Police Station", "Sabaki Mlolongo",
    "Sewage Estate", "SGR Nairobi Terminus", "Syokimau", "Syokimau Railway Station", "Tala", "Utawala","Utawala Fagilia Stage","Utawala Kinka", "Ruai Bypass",
    "Utawala Airbase", "Utawala Benedicta", "Utawala Shooters", "Utawala Valley 13", "Utawala Phase 21",
    "Athi River Block 84", "Mlolongo Bypass", "Syokimau Phase 3", "Rongai West", "Kitengela Phase", "Ongata Rongai Road",
    "Ruai Bus Stage"
  ],
  "Zone 6": [
    "Banana", "Banana Hill", "Boma Estate Ruaka", "Gachie Shopping Centre", "Gatundu", "Juja", "Juja Farm",
    "Kahawa Barracks", "Karura", "Karura Forest Gate Ruaka", "Kiambu", "Kiserian", "Limuru",
    "Limuru Road Ndenderu", "Machakos", "Makongeni Thika", "Muchatha", "Muguga (Kikuyu)", "Ndenderu",
    "Ngong", "Ruiru", "Ruiru Bypass", "Rwaka", "Tatu City", "Thika", "Thogoto", "Tigoni", "Tigoni Tea Estates",
    "Two Rivers Mall", "Village Market", "Ruiru South", "Kiambu Road Park", "Ruaka Estate", "Kiambu Heights"
  ],
  "Zone 7": [
    "Test"
  ],
  "Slums": [
    "Gatwekera", "Huruma", "Kambi Muru", "Kiambiu", "Kibera", "Kibera DC",
    "Kibera Katwekera", "Kibera Kianda", "Kibera Lindi", "Kibera Makina", "Kibera Olympic", "Kibera Silanga",
    "Kichinjio", "Kisumu Ndogo", "Korogocho", "Korogocho Gitathuru", "Korogocho Grogan A", "Korogocho Grogan B",
    "Korogocho Highridge", "Korogocho Kisumu Ndogo", "Korogocho Nyayo", "Kware", "Laini Saba", "Lindi",
    "Majengo", "Marurui", "Mashimoni", "Mathare", "Mathare Valley", "Matopeni", "Mihang'o", "Muirigo",
    "Mukuru kwa Njenga", "Mukuru kwa Reuben", "Mukuru slums", "Mukuru Viwandani", "Ofafa", "Raila",
    "Sarang'ombe", "Shilanga", "Siranga", "Soweto East", "Soweto West", "Viwandani", "Huruma Heights", "Mukuru Stop",
    "Dandora View 300", "Korogocho Plaza 427", "Mathare Close", "Kibera Phase 153"
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
  "Slums": 200
};

const defaultFee = 0;

/**
 * Calculates the delivery fee based on the address.
 * @param {string} address The delivery address.
 * @returns {number} The delivery fee.
 */
export function getDeliveryFee(address) {
  if (!address || address.trim() === '') return 0;
  const lower = address.toLowerCase();
  for (const zone in zones) {
    // Using find to be slightly more efficient. It stops once a match is found for the zone.
    const foundLocation = zones[zone].find(loc => lower.includes(loc.toLowerCase()));
    if (foundLocation) {
      return zoneFees[zone];
    }
  }
  return defaultFee;
}

export { zones, zoneFees, defaultFee };

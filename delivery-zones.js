// delivery-zones.js

// This file contains a static list of delivery locations in Nairobi and its environs,
// categorized into zones with corresponding fees. This allows for predictable pricing
// based on the customer's stated delivery area.

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

// A mapping of each zone to its specific delivery fee.
const zoneFees = {
    "Zone 1": 150,
    "Zone 2": 250,
    "Zone 3": 350,
    "Zone 4": 450,
    "Zone 5": 600,
    "Zone 6": 800,
    "Zone 7": 1,
    "Slums": 200, 
};

// A default fee for any location that is not found in our predefined zones.
// This ensures that every customer gets a quote.
const defaultFee = 500;

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

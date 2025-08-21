// receipt.js
// This module is responsible for generating a PDF receipt for a given order.
// It is wrapped in an IIFE to prevent direct access from the browser console.

(function() {
    // All code is now inside this function's scope

    // Since this module is imported by other modules, we need to attach the
    // generateReceipt function to the window object to make it accessible.
    window.receiptGenerator = {
        generate: generateReceipt
    };

    /**
     * Shows a temporary notification message on the screen.
     * @param {string} message - The message to display.
     */
    function showToast(message) {
        const toast = document.getElementById('toast');
        if (toast) {
            toast.textContent = message;
            toast.classList.remove('hidden');
            toast.classList.add('show');
            setTimeout(() => {
                toast.classList.remove('show');
                toast.classList.add('hidden');
            }, 3000);
        } else {
            console.log("Toast:", message);
        }
    }


    /**
     * Converts an image URL to a Base64 Data URL.
     * @param {string} url - The URL of the image to convert.
     * @returns {Promise<string>} A promise that resolves with the Base64 Data URL.
     */
    function toDataURL(url) {
        return fetch(url)
            .then(response => response.blob())
            .then(blob => new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result);
                reader.onerror = reject;
                reader.readAsDataURL(blob);
            }));
    }

    /**
     * Generates and triggers the download of a PDF receipt.
     * @param {Object} orderData - An object containing all necessary order details.
     */
    async function generateReceipt(orderData) {
        showToast("Generating your receipt...");

        let logoDataUrl = '';
        try {
            logoDataUrl = await toDataURL('IMAGE/LOG.png');
        } catch (error) {
            console.error("Could not load logo for PDF, proceeding without it.", error);
            showToast("Warning: Could not load the logo for the receipt.");
        }

        const items = orderData.items || [];
        const subtotal = items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
        const deliveryFee = orderData.deliveryFee || 0;
        const total = orderData.total || subtotal + deliveryFee;

        const receiptContent = document.createElement('div');
        receiptContent.style.width = '210mm';

        const receiptHtml = `
            <html>
            <head>
                <style>
                    body { font-family: Arial, sans-serif; font-size: 12px; color: #333; }
                    .receipt-container { padding: 20px; }
                    .header { text-align: center; margin-bottom: 20px; }
                    .header img { height: 80px; margin-bottom: 10px; }
                    .header h1 { color: #2e7d32; font-size: 24px; margin: 0; }
                    .details { margin-bottom: 20px; }
                    table { width: 92%; border-collapse: collapse; margin-bottom: 20px; }
                    th, td { padding: 8px; border: 1px solid #ddd; }
                    th { background-color: #f0fdf4; text-align: left; }
                    .text-right { text-align: right; }
                    .text-center { text-align: center; }
                    tfoot .total-row { background-color: #f0fdf4; font-weight: bold; font-size: 14px; }
                    .footer { text-align: center; margin-top: 20px; font-size: 10px; color: #777; }
                </style>
            </head>
            <body>
                <div class="receipt-container">
                    <div class="header">
                        ${logoDataUrl ? `<img src="${logoDataUrl}" alt="Town Treasure Logo">` : ''}
                        <h1>Town Treasure Groceries</h1>
                        <p>Order Receipt</p>
                    </div>
                    <div class="details">
                        <p><strong>Order Number:</strong> ${orderData.order_number || orderData.orderNumber}</p>
                        <p><strong>Date:</strong> ${new Date().toLocaleDateString()}</p>
                        <p><strong>Customer:</strong> ${orderData.full_name || orderData.fullName}</p>
                        <p><strong>Phone:</strong> ${orderData.phone}</p>
                        <p><strong>Address:</strong> ${orderData.address}</p>
                        ${orderData.mpesa_receipt_number ? `<p><strong>M-Pesa Receipt:</strong> ${orderData.mpesa_receipt_number}</p>` : ''}
                    </div>
                    <table>
                        <thead>
                            <tr>
                                <th>Item</th>
                                <th class="text-right">Price</th>
                                <th class="text-center">Qty</th>
                                <th class="text-right">Total</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${items.map(item => `
                                <tr>
                                    <td>${item.name}</td>
                                    <td class="text-right">KSh ${item.price.toLocaleString()}</td>
                                    <td class="text-center">${item.quantity}</td>
                                    <td class="text-right">KSh ${(item.price * item.quantity).toLocaleString()}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                        <tfoot>
                            <tr>
                                <td colspan="3" class="text-right"><strong>Subtotal:</strong></td>
                                <td class="text-right"><strong>KSh ${subtotal.toLocaleString()}</strong></td>
                            </tr>
                            <tr>
                                <td colspan="3" class="text-right"><strong>Delivery Fee:</strong></td>
                                <td class="text-right"><strong>KSh ${deliveryFee.toLocaleString()}</strong></td>
                            </tr>
                            <tr class="total-row">
                                <td colspan="3" class="text-right">Grand Total:</td>
                                <td class="text-right">KSh ${total.toLocaleString()}</td>
                            </tr>
                        </tfoot>
                    </table>
                    <div class="footer">
                        <p>Thank you for shopping with Town Treasure Groceries!</p>
                    </div>
                </div>
            </body>
            </html>
        `;
    
        receiptContent.innerHTML = receiptHtml;

        const options = {
            margin: 10,
            filename: `receipt_${orderData.order_number || orderData.orderNumber}.pdf`,
            image: { type: 'jpeg', quality: 0.98 },
            html2canvas: { scale: 2 },
            jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
        };

        html2pdf().set(options).from(receiptContent).save();
    }

})();

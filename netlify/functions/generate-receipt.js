// netlify/functions/generate-receipt.js

const { createClient } = require('@supabase/supabase-js');
const PDFDocument = require('pdfkit');
const path = require('path');
const fs = require('fs');
const QRCode = require('qrcode');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

exports.handler = async function(event) {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        const { orderId } = JSON.parse(event.body);
        if (!orderId) {
            return { statusCode: 400, body: 'Order ID is required.' };
        }

        const { data: order, error } = await supabase
            .from('paid_orders')
            .select('*')
            .eq('id', orderId)
            .single();

        if (error || !order) {
            throw new Error('Order not found or could not be fetched.');
        }

        const doc = new PDFDocument({ margin: 0, size: 'A4' });
        const buffers = [];
        doc.on('data', buffers.push.bind(buffers));

        // --- STYLING DEFINITIONS ---
        const brandColorGreen = '#64B93E';
        const brandColorDark = '#333D44';
        const lightGray = '#F2F2F2';
        const textGray = '#6B7280';
        const pageMargin = 50;

        // --- HELPER FUNCTION FOR TABLE ROWS ---
        function generateTableRow(y, itemNumber, description, unitPrice, quantity, total) {
            const rowIsEven = parseInt(itemNumber) % 2 === 0;
            if (rowIsEven) {
                doc.rect(pageMargin, y, doc.page.width - (pageMargin * 2), 25).fill(lightGray);
            }
            doc.fontSize(10).fillColor(brandColorDark)
               .text(itemNumber, pageMargin + 15, y + 8)
               .text(description, pageMargin + 80, y + 8, { width: 190 })
               .text(`KSh ${unitPrice}`, pageMargin + 270, y + 8, { width: 80, align: 'right' })
               .text(quantity, pageMargin + 370, y + 8, { width: 50, align: 'center' })
               .text(`KSh ${total}`, pageMargin + 430, y + 8, { width: 80, align: 'right' });
        }

        // --- HEADER GRAPHICS ---
        doc.save()
           .moveTo(0, 0)
           .lineTo(doc.page.width, 0)
           .lineTo(doc.page.width, 120)
           .quadraticCurveTo(doc.page.width / 2, 180, 0, 120)
           .fill(brandColorGreen);

        doc.save()
           .moveTo(doc.page.width, 0)
           .lineTo(doc.page.width, 80)
           .quadraticCurveTo(doc.page.width - 200, 120, doc.page.width - 400, 80)
           .lineTo(doc.page.width - 400, 0)
           .fill(brandColorDark);

        // --- AMENDMENT 1: Corrected Header Content Layout ---
        const logoPath = path.resolve(__dirname, 'Preloader.png');
        if (fs.existsSync(logoPath)) {
            doc.image(logoPath, pageMargin, 40, { width: 90 });
        }
        
        let headerTextY = 45;
        doc.fontSize(10).font('Helvetica').fillColor(brandColorDark)
            .text('Town Treasure Groceries', 350, headerTextY, { align: 'right' })
            .text('City Park Market, Limuru Road', 350, headerTextY += 15, { align: 'right' })
            .text('Nairobi, Kenya', 350, headerTextY += 15, { align: 'right' });

        // --- RECEIPT INFO ---
        const infoTop = 180;
        doc.fontSize(20).font('Helvetica-Bold').fillColor(brandColorGreen).text('RECEIPT', pageMargin, infoTop);
        doc.moveTo(pageMargin, infoTop + 25).lineTo(200, infoTop + 25).stroke(brandColorGreen);

        doc.fontSize(10).font('Helvetica-Bold').fillColor(brandColorDark)
           .text('Receipt No:', 350, infoTop)
           .text('Order Date:', 350, infoTop + 15);
           
        doc.font('Helvetica').fillColor(textGray)
           .text(order.order_number, 420, infoTop)
           .text(new Date(order.created_at).toLocaleDateString('en-KE'), 420, infoTop + 15);

        // --- AMENDMENT 2: Corrected "BILLED TO" Overlap ---
        const billToTop = infoTop + 50;
        doc.fontSize(12).font('Helvetica-Bold').fillColor(brandColorDark).text('BILLED TO:', pageMargin, billToTop);
        
        let billToY = billToTop + 20;
        doc.font('Helvetica').fillColor(textGray).fontSize(10)
           .text(order.full_name, pageMargin, billToY);
        billToY += 18; // Increased vertical spacing
        doc.text(order.address, pageMargin, billToY);
        billToY += 18; // Increased vertical spacing
        doc.text(order.phone, pageMargin, billToY);

        // --- TABLE HEADER ---
        const tableTop = 350;
        doc.rect(pageMargin, tableTop, doc.page.width - (pageMargin * 2), 30).fill(brandColorDark);
        doc.fontSize(10).fillColor('#FFF')
           .text('SL No.', pageMargin + 15, tableTop + 10)
           .text('Item Description', pageMargin + 80, tableTop + 10)
           .text('Unit Price', pageMargin + 270, tableTop + 10, { width: 80, align: 'right' })
           .text('Quantity', pageMargin + 370, tableTop + 10, { width: 50, align: 'center' })
           .text('Total', pageMargin + 430, tableTop + 10, { width: 80, align: 'right' });

        let itemY = tableTop + 30;
        let subtotal = 0;
        order.items.forEach((item, i) => {
            const itemTotal = item.quantity * item.price;
            subtotal += itemTotal;
            generateTableRow(itemY, (i + 1).toString().padStart(2, '0'), item.name, item.price.toLocaleString(), item.quantity, itemTotal.toLocaleString());
            itemY += 25;
        });

        // --- AMENDMENT 3: Corrected Totals Section Overlap ---
        const totalsTop = itemY + 20;
        doc.fontSize(10).fillColor(brandColorDark)
           .text('Sub Total:', 400, totalsTop, { align: 'right' })
           .text(`KSh ${subtotal.toLocaleString()}`, 0, totalsTop, { align: 'right' });
           
        const grandTotalY = totalsTop + 20; // Added space between subtotal and grand total
        doc.rect(400, grandTotalY, doc.page.width - 450, 25).fill(brandColorGreen);
        doc.font('Helvetica-Bold').fillColor('#FFF')
           .text('Grand Total:', 400, grandTotalY + 7, { align: 'right' })
           .text(`KSh ${order.total.toLocaleString()}`, 0, grandTotalY + 7, { align: 'right' });

        // --- PAYMENT DETAILS & QR CODE ---
        const paymentTop = itemY + 20;
        doc.font('Helvetica-Bold').fontSize(12).fillColor(brandColorDark).text('Payment Details:', pageMargin, paymentTop);
        doc.font('Helvetica').fontSize(10)
           .text(`M-Pesa Code: ${order.mpesa_receipt_number || 'N/A'}`, pageMargin, paymentTop + 20);

        const orderUrl = `https://towntreasuregroceries.netlify.app/account?order=${order.order_number}`;
        const qrCodeData = await QRCode.toDataURL(orderUrl);
        doc.image(qrCodeData, pageMargin, paymentTop + 45, { width: 80 });
        doc.fillColor(textGray).text('Scan to view your order online.', pageMargin, paymentTop + 130);

        // --- FOOTER GRAPHICS ---
        const footerY = doc.page.height - 100;
        doc.save()
           .moveTo(0, footerY)
           .quadraticCurveTo(doc.page.width / 2, footerY - 50, doc.page.width, footerY)
           .lineTo(doc.page.width, doc.page.height)
           .lineTo(0, doc.page.height)
           .fill(brandColorDark);
           
        doc.font('Helvetica-Bold').fillColor('#FFF').fontSize(14).text('THANK YOU FOR YOUR BUSINESS', pageMargin, footerY + 40);

        doc.end();

        return new Promise(resolve => {
            doc.on('end', () => {
                const pdfData = Buffer.concat(buffers);
                resolve({
                    statusCode: 200,
                    headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="receipt-${order.order_number}.pdf"` },
                    body: pdfData.toString('base64'),
                    isBase64Encoded: true
                });
            });
        });

    } catch (error) {
        console.error('Error generating PDF:', error);
        return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    }
};
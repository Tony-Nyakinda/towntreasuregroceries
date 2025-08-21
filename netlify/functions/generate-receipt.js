// netlify/functions/generate-receipt.js

const { createClient } = require('@supabase/supabase-js');
const PDFDocument = require('pdfkit');
const path = require('path');
const fs = require('fs');
const QRCode = require('qrcode');

// Initialize Supabase client using environment variables
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

        const doc = new PDFDocument({ margin: 50, size: 'A4' });
        const buffers = [];
        doc.on('data', buffers.push.bind(buffers));

        // --- STYLING DEFINITIONS ---
        const brandColor = '#2E7D32';
        const lightGray = '#F3F4F6';
        const darkGray = '#374151';
        const textGray = '#6B7280';

        // --- MODERN HEADER ---
        doc.rect(0, 0, doc.page.width, 90).fill(lightGray); // Made header slightly smaller

        const logoPath = path.resolve(__dirname, 'Preloader.png');
        if (fs.existsSync(logoPath)) {
            // --- AMENDMENT 1: Moved logo higher ---
            doc.image(logoPath, 50, 18, { width: 100 }); // Adjusted Y-coordinate from 25 to 20
        }

        doc.fontSize(10).font('Helvetica').fillColor(textGray)
           .text('Town Treasure Groceries', doc.page.width - 200, 30, { align: 'right', width: 150 })
           .text('City Park Market, Limuru Road', doc.page.width - 200, 45, { align: 'right', width: 150 })
           .text('Nairobi, Kenya', doc.page.width - 200, 60, { align: 'right', width: 150 });

        // --- RECEIPT TITLE ---
        doc.fontSize(24).font('Helvetica-Bold').fillColor(darkGray).text('Receipt', 50, 120);
        doc.moveTo(50, 150).lineTo(doc.page.width - 50, 150).stroke(lightGray);

        // --- ORDER & CUSTOMER INFO ---
        const infoTop = 170;
        doc.fontSize(10).font('Helvetica-Bold').fillColor(darkGray)
           .text('BILLED TO', 50, infoTop)
           .text('ORDER DETAILS', 300, infoTop);

        doc.font('Helvetica').fillColor(textGray);

        // --- AMENDMENT 2: Fixed "BILLED TO" text overlap ---
        let billToY = infoTop + 15;
        doc.text(order.full_name, 50, billToY);
        billToY += 15; // Manually increase Y position for the next line
        doc.text(order.address, 50, billToY, { width: 200 });
        billToY += 15; // Manually increase Y position for the next line
        doc.text(order.phone, 50, billToY);

        doc.text(`Order Number: ${order.order_number}`, 300, infoTop + 15)
           .text(`Order Date: ${new Date(order.created_at).toLocaleString('en-KE', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Africa/Nairobi' })}`, 300, infoTop + 30)
           .font('Helvetica-Bold').fillColor(brandColor)
           .text(`M-Pesa Code: ${order.mpesa_receipt_number || 'N/A'}`, 300, infoTop + 45);

        // --- ITEMS TABLE ---
        const tableTop = 260; // Adjusted table position
        doc.font('Helvetica-Bold');
        doc.rect(50, tableTop, doc.page.width - 100, 25).fill(lightGray);
        doc.fillColor(darkGray).text('ITEM', 60, tableTop + 8)
           .text('QTY', 320, tableTop + 8, { width: 50, align: 'center' })
           .text('PRICE', 410, tableTop + 8, { width: 60, align: 'right' })
           .text('TOTAL', 0, tableTop + 8, { align: 'right' });

        let i = 0;
        doc.font('Helvetica').fillColor(textGray);
        order.items.forEach(item => {
            const y = tableTop + 35 + (i * 25);
            doc.text(item.name, 60, y)
               .text(item.quantity.toString(), 320, y, { width: 50, align: 'center' })
               .text(`KSh ${item.price.toLocaleString()}`, 410, y, { width: 60, align: 'right' })
               .text(`KSh ${(item.quantity * item.price).toLocaleString()}`, 0, y, { align: 'right' });
            i++;
        });

        // --- TOTAL ---
        const totalY = tableTop + 40 + (i * 25);
        doc.moveTo(300, totalY).lineTo(doc.page.width - 50, totalY).stroke(lightGray);
        doc.font('Helvetica-Bold').fillColor(brandColor).fontSize(16)
           .text('Total Paid:', 300, totalY + 10)
           .text(`KSh ${order.total.toLocaleString()}`, 0, totalY + 10, { align: 'right' });

        // --- AMENDMENT 3: Realigned footer elements ---
        const footerY = doc.page.height - 120; // Set a consistent starting point for the footer block
        // Generate QR code (placeholder URL for now)
        const qrCodeData = await QRCode.toDataURL('https://towntreasuregroceries.netlify.app/');
        doc.image(qrCodeData, 50, footerY, { width: 70 });

        doc.fontSize(9).fillColor(textGray)
           .text('Scan for our website', 50, footerY + 75) // Positioned text correctly below QR code
           .text('Thank you for your business!', doc.page.width - 250, footerY + 35, { align: 'right', width: 200 }); // Aligned "Thank you"

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
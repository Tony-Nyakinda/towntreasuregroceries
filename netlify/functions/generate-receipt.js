// netlify/functions/generate-receipt.js

const { createClient } = require('@supabase/supabase-js');
const PDFDocument = require('pdfkit');
const path = require('path');
const fs = require('fs');

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
        const lightGray = '#E5E7EB';
        const darkGray = '#4B5563';
        const textGray = '#6B7280';

        // --- HEADER ---
        // --- AMENDMENT 1: Logo Path (Final Fix) ---
        // This path now correctly looks for the logo in the SAME directory as this script.
        const logoPath = path.resolve(__dirname, 'Preloader.png');
        if (fs.existsSync(logoPath)) {
            doc.image(logoPath, 50, 45, { width: 100 });
        }

        doc.fontSize(10)
           .font('Helvetica')
           .fillColor(textGray)
           .text('Town Treasure Groceries', 200, 50, { align: 'right' })
           .text('City Park Market, Limuru Road', 200, 65, { align: 'right' })
           .text('Nairobi, Kenya', 200, 80, { align: 'right' });
        doc.moveDown(4);

        // --- TITLE AND ORDER DETAILS ---
        doc.fontSize(20).font('Helvetica-Bold').fillColor(darkGray).text('Receipt', 50, 140);
        doc.moveDown(0.5);

        const orderDateTime = new Date(order.created_at).toLocaleString('en-KE', {
            dateStyle: 'short',
            timeStyle: 'short',
            timeZone: 'Africa/Nairobi',
            hour24: true
        });

        // --- AMENDMENT 2: Text Overlap Corrected ---
        // Manually controlling the vertical position of each line to guarantee spacing.
        let detailsY = 145;
        doc.fontSize(10).font('Helvetica');
        doc.fillColor(textGray).text(`Order Number: ${order.order_number}`, 400, detailsY);
        detailsY += 15; // Move down 15 points
        doc.fillColor(textGray).text(`Order Date: ${orderDateTime}`, 400, detailsY);
        detailsY += 15; // Move down another 15 points
        doc.fillColor(brandColor).font('Helvetica-Bold').text(`M-Pesa Code: ${order.mpesa_receipt_number || 'N/A'}`, 400, detailsY);
        doc.moveDown(3);

        // --- BILL TO SECTION ---
        doc.fontSize(10).font('Helvetica-Bold').fillColor(darkGray).text('Bill To:', 50);
        doc.font('Helvetica').fillColor(textGray).text(order.full_name);
        doc.text(order.address);
        doc.text(order.phone);
        doc.moveDown(2);

        // --- ITEMS TABLE ---
        const tableTop = doc.y;
        doc.font('Helvetica-Bold').fillColor(darkGray);

        doc.rect(50, tableTop, 510, 20).fill(lightGray);
        doc.fillColor(darkGray).text('Item Description', 60, tableTop + 5, { width: 220 });
        doc.text('Qty', 290, tableTop + 5, { width: 50, align: 'center' });
        doc.text('Unit Price', 350, tableTop + 5, { width: 90, align: 'right' });
        doc.text('Total', 450, tableTop + 5, { width: 90, align: 'right' });
        
        const itemsStartY = tableTop + 25;
        doc.font('Helvetica').fontSize(10).fillColor(textGray);
        order.items.forEach((item, i) => {
            const y = itemsStartY + (i * 25);
            doc.text(item.name, 60, y, { width: 220 });
            doc.text(item.quantity.toString(), 290, y, { width: 50, align: 'center' });
            doc.text(`KSh ${item.price.toLocaleString()}`, 350, y, { width: 90, align: 'right' });
            doc.text(`KSh ${(item.quantity * item.price).toLocaleString()}`, 450, y, { width: 90, align: 'right' });
        });

        // --- TOTAL ---
        const totalY = itemsStartY + (order.items.length * 25) + 10;
        doc.font('Helvetica-Bold').fillColor(brandColor);
        doc.fontSize(14).text(`Total Paid: KSh ${order.total.toLocaleString()}`, 50, totalY, { align: 'right' });
        doc.moveDown(4);

        // --- FOOTER ---
        const footerY = doc.page.height - 100;
        doc.moveTo(50, footerY).lineTo(560, footerY).stroke(lightGray);
        doc.fontSize(10).font('Helvetica').fillColor(textGray)
           .text('Thank you for your business. We appreciate you!', 50, footerY + 15, { align: 'center', width: 510 });

        doc.end();

        return new Promise(resolve => {
            doc.on('end', () => {
                const pdfData = Buffer.concat(buffers);
                resolve({
                    statusCode: 200,
                    headers: {
                        'Content-Type': 'application/pdf',
                        'Content-Disposition': `attachment; filename="receipt-${order.order_number}.pdf"`
                    },
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
// netlify/functions/generate-receipt.js

const { createClient } = require('@supabase/supabase-js');
const PDFDocument = require('pdfkit');
const path = require('path');
const fs = require('fs');

// Initialize Supabase client using environment variables
// Make sure to set these in your Netlify dashboard!
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

        // 1. Fetch the complete order details from Supabase
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

        // --- AMENDMENT: Helper function for drawing horizontal lines ---
        function drawHr(y) {
            doc.strokeColor("#aaaaaa")
               .lineWidth(1)
               .moveTo(50, y)
               .lineTo(550, y)
               .stroke();
        }

        // --- AMENDMENT: Add Logo and Header ---
        // IMPORTANT: Place your logo image in your project, e.g., at the root in an `assets` folder.
        // The path here is relative to the function's location at build time.
        // Let's assume you have an 'IMAGE/LOG.png' at your project root.
        const logoPath = path.resolve(__dirname, '..', '..', 'IMAGE', 'LOG.png');
        if (fs.existsSync(logoPath)) {
            doc.image(logoPath, 50, 45, { width: 100 });
        } else {
            doc.fontSize(20).text('Town Treasure Groceries', 50, 57);
        }

        doc.fontSize(10)
           .text('Town Treasure Groceries', 200, 50, { align: 'right' })
           .text('City Park Market, Limuru Road', 200, 65, { align: 'right' })
           .text('Nairobi, Kenya', 200, 80, { align: 'right' });
        doc.moveDown(3);

        drawHr(doc.y);
        doc.moveDown();

        // --- AMENDMENT: Add Customer Details and Order Info ---
        doc.fontSize(12).font('Helvetica-Bold').text('Receipt', { align: 'center' });
        doc.moveDown();

        const customerInfoTop = doc.y;
        doc.fontSize(10).font('Helvetica-Bold');
        doc.text('Bill To:', 50, customerInfoTop);
        doc.text('Order Details:', 350, customerInfoTop);

        doc.font('Helvetica');
        doc.text(order.full_name, 50, customerInfoTop + 15);
        doc.text(order.address, 50, customerInfoTop + 30);
        doc.text(order.phone, 50, customerInfoTop + 45);

        // --- AMENDMENT: Add M-Pesa Code and other order details ---
        doc.text(`Order Number: ${order.order_number}`, 350, customerInfoTop + 15);
        doc.text(`Order Date: ${new Date(order.created_at).toLocaleDateString()}`, 350, customerInfoTop + 30);
        doc.text(`M-Pesa Code: ${order.mpesa_receipt_number || 'N/A'}`, 350, customerInfoTop + 45);
        doc.moveDown(4);

        // --- AMENDMENT: Create a professional-looking table for items ---
        const invoiceTableTop = doc.y;
        doc.font('Helvetica-Bold');
        doc.text('Item Description', 50, invoiceTableTop);
        doc.text('Qty', 280, invoiceTableTop, { width: 90, align: 'center' });
        doc.text('Unit Price', 370, invoiceTableTop, { width: 90, align: 'right' });
        doc.text('Total', 0, invoiceTableTop, { align: 'right' });
        doc.font('Helvetica');
        drawHr(doc.y + 15);
        doc.moveDown();

        let i = 0;
        order.items.forEach(item => {
            const y = doc.y;
            doc.text(item.name, 50, y);
            doc.text(item.quantity.toString(), 280, y, { width: 90, align: 'center' });
            doc.text(`KSh ${item.price.toLocaleString()}`, 370, y, { width: 90, align: 'right' });
            doc.text(`KSh ${(item.quantity * item.price).toLocaleString()}`, 0, y, { align: 'right' });
            doc.moveDown();
            i++;
        });

        drawHr(doc.y);
        doc.moveDown();

        // --- Summary section ---
        doc.font('Helvetica-Bold');
        doc.text(`Total Paid: KSh ${order.total.toLocaleString()}`, { align: 'right' });
        doc.font('Helvetica');
        doc.moveDown(3);

        // --- Footer ---
        doc.fontSize(10).text('Thank you for your business. We appreciate you!', { align: 'center', width: 500 });

        doc.end();

        // Return the PDF as a base64 encoded string
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
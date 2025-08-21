// netlify/functions/generate-receipt.js

const { createClient } = require('@supabase/supabase-js');
const PDFDocument = require('pdfkit');
const path = require('path');
const fs = require('fs');
const QRCode = require('qrcode');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const { orderId } = JSON.parse(event.body || '{}');
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

    const items = Array.isArray(order.items)
      ? order.items
      : (() => { try { return JSON.parse(order.items || '[]'); } catch { return []; } })();

    const doc = new PDFDocument({ margin: 0, size: 'A4' });
    const buffers = [];
    doc.on('data', buffers.push.bind(buffers));

    // --- THEME ---
    const brandGreen = '#64B93E';
    const brandDark = '#333D44';
    const lightGray = '#F2F2F2';
    const textGray = '#6B7280';
    const pageMargin = 50;
    const pageWidth = doc.page.width;
    const contentWidth = pageWidth - pageMargin * 2;

    const KES = (n) => `KSh ${Number(n || 0).toLocaleString('en-KE')}`;

    // ---- HEADER BACKGROUND ----
    doc.save()
      .moveTo(0, 0).lineTo(pageWidth, 0).lineTo(pageWidth, 120)
      .quadraticCurveTo(pageWidth / 2, 180, 0, 120)
      .fill(brandGreen);

    doc.save()
      .moveTo(pageWidth, 0).lineTo(pageWidth, 80)
      .quadraticCurveTo(pageWidth - 200, 120, pageWidth - 400, 80)
      .lineTo(pageWidth - 400, 0)
      .fill(brandDark);

    // ---- LOGO ----
    const logoPath = path.resolve(__dirname, 'Preloader.png');
    if (fs.existsSync(logoPath)) {
      doc.image(logoPath, pageMargin, 40, { width: 90 });
    }

    // ---- RECEIPT INFO ----
    const infoTop = 180;
    doc.font('Helvetica-Bold').fontSize(20).fillColor(brandGreen).text('RECEIPT', pageMargin, infoTop);
    doc.moveTo(pageMargin, infoTop + 25).lineTo(pageMargin + 150, infoTop + 25).stroke(brandGreen);

    doc.fontSize(10).fillColor(brandDark).font('Helvetica-Bold')
      .text('Receipt No:', pageWidth - pageMargin - 200, infoTop, { width: 100, align: 'left' })
      .text('Order Date:', pageWidth - pageMargin - 200, infoTop + 15, { width: 100, align: 'left' });

    // Local time in Nairobi
    const orderDateStr = new Date(order.created_at).toLocaleString('en-KE', {
      timeZone: 'Africa/Nairobi',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });

    doc.font('Helvetica').fillColor(textGray)
      .text(String(order.order_number || ''), pageWidth - pageMargin - 100, infoTop, { width: 100, align: 'right' })
      .text(orderDateStr, pageWidth - pageMargin - 100, infoTop + 15, { width: 100, align: 'right' });

    // ---- BILLED TO ----
    const billToTop = infoTop + 50;
    doc.font('Helvetica-Bold').fontSize(12).fillColor(brandDark).text('BILLED TO:', pageMargin, billToTop);

    let y = billToTop + 16;
    doc.font('Helvetica').fontSize(10).fillColor(textGray);

    const addLine = (line) => {
      if (!line) return;
      const h = doc.heightOfString(String(line), { width: 260 });
      doc.text(String(line), pageMargin, y, { width: 260 });
      y += h + 6;
    };

    addLine(order.full_name);
    addLine(order.address);
    addLine(order.phone);

    y += 12;

    // ---- TABLE HEADER ----
    const tableTop = Math.max(y, 300);
    const col = { sl: 40, gap: 10, unit: 90, qty: 60, total: 90 };
    col.desc = contentWidth - (col.sl + col.gap * 4 + col.unit + col.qty + col.total);

    doc.rect(pageMargin, tableTop, contentWidth, 28).fill(brandDark);
    doc.fontSize(10).fillColor('#FFFFFF').font('Helvetica-Bold');
    doc.text('SL No.', pageMargin + 8, tableTop + 9, { width: col.sl - 16, align: 'left' });
    doc.text('Item Description', pageMargin + col.sl + col.gap, tableTop + 9, { width: col.desc, align: 'left' });
    doc.text('Unit Price', pageMargin + col.sl + col.gap + col.desc + col.gap, tableTop + 9, { width: col.unit, align: 'right' });
    doc.text('Quantity', pageMargin + col.sl + col.gap + col.desc + col.gap + col.unit + col.gap, tableTop + 9, { width: col.qty, align: 'center' });
    doc.text('Total', pageMargin + col.sl + col.gap + col.desc + col.gap + col.unit + col.gap + col.qty + col.gap, tableTop + 9, { width: col.total, align: 'right' });

    // ---- TABLE ROWS ----
    let rowY = tableTop + 28;
    let zebra = false;
    let subtotal = 0;
    doc.font('Helvetica').fillColor(brandDark);

    for (let i = 0; i < items.length; i++) {
      const it = items[i] || {};
      const name = String(it.name ?? it.item ?? '');
      const qty = Number(it.quantity ?? it.qty ?? 0);
      const price = Number(it.price ?? it.unit_price ?? 0);
      const total = qty * price;
      subtotal += total;

      const descH = Math.max(12, doc.heightOfString(name || '-', { width: col.desc }));
      const rowH = Math.max(24, descH + 12);

      if (zebra) {
        doc.rect(pageMargin, rowY, contentWidth, rowH).fill(lightGray);
        doc.fillColor(brandDark);
      }
      zebra = !zebra;

      doc.fontSize(10);
      doc.text(String(i + 1).padStart(2, '0'), pageMargin + 8, rowY + 8, { width: col.sl - 16, align: 'left' });
      doc.text(name || '-', pageMargin + col.sl + col.gap, rowY + 8, { width: col.desc });
      doc.text(KES(price), pageMargin + col.sl + col.gap + col.desc + col.gap, rowY + 8, { width: col.unit, align: 'right' });
      doc.text(String(qty), pageMargin + col.sl + col.gap + col.desc + col.gap + col.unit + col.gap, rowY + 8, { width: col.qty, align: 'center' });
      doc.text(KES(total), pageMargin + col.sl + col.gap + col.desc + col.gap + col.unit + col.gap + col.qty + col.gap, rowY + 8, { width: col.total, align: 'right' });

      rowY += rowH;
    }

    // ---- SEPARATOR ----
    const sepY = rowY + 6;
    doc.moveTo(pageMargin, sepY).lineTo(pageWidth - pageMargin, sepY).lineWidth(1).strokeColor('#CCCCCC').stroke();

    // ---- TOTALS ----
    const totalsY = sepY + 16;
    const labelW = 110;
    const valueW = 110;
    const boxW = labelW + valueW + 20;
    const boxX = pageMargin + contentWidth - boxW;

    doc.font('Helvetica').fontSize(10).fillColor(brandDark);
    doc.text('Sub Total:', boxX, totalsY, { width: labelW, align: 'right' });
    doc.text(KES(subtotal), boxX + labelW, totalsY, { width: valueW, align: 'right' });

    const gtY = totalsY + 28;
    doc.rect(boxX, gtY, boxW, 28).fill(brandGreen);
    doc.font('Helvetica-Bold').fillColor('#FFFFFF');
    doc.text('Grand Total:', boxX, gtY + 7, { width: labelW, align: 'right' });
    doc.text(KES(order.total ?? subtotal), boxX + labelW, gtY + 7, { width: valueW, align: 'right' });

    // ---- PAYMENT DETAILS (left) ----
    const payY = gtY + 50;
    doc.font('Helvetica-Bold').fontSize(12).fillColor(brandDark)
      .text('Payment Details:', pageMargin, payY);
    doc.font('Helvetica').fontSize(10).fillColor(textGray)
      .text(`M-Pesa Code: ${order.mpesa_receipt_number || 'N/A'}`, pageMargin, payY + 20);

    const orderUrl = `https://towntreasuregroceries.netlify.app/account?order=${order.order_number}`;
    const qrCodeData = await QRCode.toDataURL(orderUrl);
    doc.image(qrCodeData, pageMargin, payY + 45, { width: 80 });
    doc.fillColor(textGray).text('Scan to view your order online.', pageMargin, payY + 130);

    // ---- COMPANY INFO (moved to right side, aligned with QR) ----
    const companyY = payY;
    doc.font('Helvetica').fontSize(9).fillColor(textGray);
    const companyX = pageWidth - pageMargin - 200; // right-aligned block
    doc.text('Town Treasure Groceries', companyX, companyY, { width: 200, align: 'right' })
       .text('City Park Market, Limuru Road', companyX, companyY + 12, { width: 200, align: 'right' })
       .text('Nairobi, Kenya', companyX, companyY + 24, { width: 200, align: 'right' })
       .text('Tel: 0720559925 / 0708567696', companyX, companyY + 36, { width: 200, align: 'right' });

    // ---- FOOTER ----
    const footerY = doc.page.height - 100;
    doc.save()
      .moveTo(0, footerY)
      .quadraticCurveTo(pageWidth / 2, footerY - 50, pageWidth, footerY)
      .lineTo(pageWidth, doc.page.height)
      .lineTo(0, doc.page.height)
      .fill(brandDark);

    doc.font('Helvetica-Bold').fillColor('#FFFFFF').fontSize(14)
      .text('THANK YOU FOR YOUR BUSINESS', pageMargin, footerY + 40);

    // ---- FINISH ----
    doc.end();

    return new Promise((resolve) => {
      doc.on('end', () => {
        const pdfData = Buffer.concat(buffers);
        resolve({
          statusCode: 200,
          headers: {
            'Content-Type': 'application/pdf',
            'Content-Disposition': `attachment; filename="receipt-${order.order_number}.pdf"`,
          },
          body: pdfData.toString('base64'),
          isBase64Encoded: true,
        });
      });
    });
  } catch (err) {
    console.error('Error generating PDF:', err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};

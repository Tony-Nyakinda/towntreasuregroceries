// netlify/functions/generate-receipt.js

const { createClient } = require('@supabase/supabase-js');
const PDFDocument = require('pdfkit');
const path = require('path');
const fs = require('fs');
const QRCode = require('qrcode');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

/** ---------- Helpers ---------- **/

// Brand watermark across the page (kept subtle)
function addStoreWatermark(doc, text) {
  doc.save();
  doc.font('Helvetica-Bold')
    .fontSize(60)
    .fillColor('#E5E7EB') // light gray
    .opacity(0.15)
    .rotate(-30, { origin: [doc.page.width / 2, doc.page.height / 2] })
    .text(text, doc.page.width / 4, doc.page.height / 2, {
      align: 'center',
      width: doc.page.width / 2,
    });
  doc.restore();
  doc.opacity(1);
}

// Unpaid stamp: square border + red ink text with rough “rubber stamp” effect
function addUnpaidStamp(doc, message = 'PENDING PAYMENT – COPY') {
  const centerX = doc.page.width / 2;
  const centerY = doc.page.height - 290; // sits above the footer area
  const boxSize = 200;

  doc.save();
  doc.rotate(-14, { origin: [centerX, centerY] }); // tilt for realism

  // Rough red square border (multi-pass jitter)
  for (let i = 0; i < 4; i++) {
    const jx = (Math.random() * 2 - 1);
    const jy = (Math.random() * 2 - 1);
    doc.rect(centerX - boxSize / 2 + jx, centerY - boxSize / 2 + jy, boxSize, boxSize)
      .lineWidth(2)
      .strokeColor('#DC2626') // red ink
      .opacity(0.55 + Math.random() * 0.15)
      .stroke();
  }

  // Text layers (ink spread)
  const w = 0.8 * boxSize;
  const x = centerX - w / 2;
  const y = centerY - 14; // slightly above center
  const offsets = [
    { dx: 0, dy: 0, op: 0.7 },
    { dx: -1, dy: 0, op: 0.45 },
    { dx: 1, dy: 1, op: 0.45 },
    { dx: 0.5, dy: -0.5, op: 0.35 }
  ];
  offsets.forEach(({ dx, dy, op }) => {
    doc.font('Helvetica-Bold')
      .fontSize(18)
      .fillColor('#DC2626')
      .opacity(op)
      .text(message, x + dx, y + dy, { width: w, align: 'center' });
  });

  doc.restore();
  doc.opacity(1);
}

// Paid stamp: tilted square + center logo + red date with layered ink effect
function addPaidStamp(doc, logoPath, orderDate) {
  const centerX = doc.page.width / 2;
  const centerY = doc.page.height - 285; // above footer
  const boxSize = 180;
  const logoSize = 120;

  doc.save();
  doc.rotate(-12, { origin: [centerX, centerY] }); // tilt whole stamp

  // Dark rough square border
  for (let i = 0; i < 4; i++) {
    const jx = (Math.random() * 2 - 1);
    const jy = (Math.random() * 2 - 1);
    doc.rect(centerX - boxSize / 2 + jx, centerY - boxSize / 2 + jy, boxSize, boxSize)
      .lineWidth(2)
      .strokeColor('#1F2937') // dark “ink”
      .opacity(0.55 + Math.random() * 0.2)
      .stroke();
  }

  // Center logo
  if (fs.existsSync(logoPath)) {
    doc.image(logoPath, centerX - logoSize / 2, centerY - logoSize / 2 - 12, {
      width: logoSize, height: logoSize
    });
  }

  // Red date, layered for ink feel
  const dateStr = new Date(orderDate).toLocaleDateString('en-KE', {
    year: 'numeric', month: '2-digit', day: '2-digit'
  });

  const textW = 120;
  const textX = centerX - textW / 2;
  const textY = centerY + logoSize / 2 - 2;

  const dateOffsets = [
    { dx: 0, dy: 0, op: 0.75 },
    { dx: -1, dy: 0, op: 0.5 },
    { dx: 1, dy: 1, op: 0.5 },
    { dx: 0.5, dy: -0.5, op: 0.4 },
  ];
  dateOffsets.forEach(({ dx, dy, op }) => {
    doc.font('Helvetica-Bold')
      .fontSize(16)
      .fillColor('#DC2626')
      .opacity(op)
      .text(dateStr, textX + dx, textY + dy, { width: textW, align: 'center' });
  });

  doc.restore();
  doc.opacity(1);
}

/** ---------- Main handler ---------- **/
exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const { orderId } = JSON.parse(event.body || '{}');
    if (!orderId) {
      return { statusCode: 400, body: 'Order ID is required.' };
    }

    // 1) Try paid_orders
    let { data: order, error } = await supabase
      .from('paid_orders')
      .select('*')
      .eq('id', orderId)
      .single();

    // Track which table the order came from
    let orderSource = 'paid';

    // 2) Fallback to unpaid_orders
    if (!order) {
      const unpaidRes = await supabase
        .from('unpaid_orders')
        .select('*')
        .eq('id', orderId)
        .single();
      order = unpaidRes.data;
      error = unpaidRes.error;
      if (order) orderSource = 'unpaid';
    }

    if (error || !order) {
      throw new Error('Order not found in paid or unpaid tables.');
    }

    // Normalize items
    const items = Array.isArray(order.items)
      ? order.items
      : (() => { try { return JSON.parse(order.items || '[]'); } catch { return []; } })();

    // PDF setup
    const doc = new PDFDocument({ margin: 0, size: 'A4', bufferPages: true });
    const buffers = [];
    doc.on('data', buffers.push.bind(buffers));

    // Theme
    const brandGreen = '#64B93E';
    const brandDark = '#333D44';
    const lightGray = '#F2F2F2';
    const textGray = '#6B7280';
    const pageMargin = 50;
    const pageWidth = doc.page.width;
    const contentWidth = pageWidth - pageMargin * 2;
    const KES = (n) => `KSh ${Number(n || 0).toLocaleString('en-KE')}`;

    // Watermark on first page
    addStoreWatermark(doc, 'Town Treasure Groceries');

    /** Header background **/
    doc.save()
      .moveTo(0, 0).lineTo(pageWidth, 0).lineTo(pageWidth, 120)
      .quadraticCurveTo(pageWidth / 2, 180, 0, 120)
      .fill(brandGreen);
    doc.save()
      .moveTo(pageWidth, 0).lineTo(pageWidth, 80)
      .quadraticCurveTo(pageWidth - 200, 120, pageWidth - 400, 80)
      .lineTo(pageWidth - 400, 0)
      .fill(brandDark);

    /** Logo **/
    const logoPath = path.resolve(__dirname, 'Preloader.png');
    if (fs.existsSync(logoPath)) {
      doc.image(logoPath, pageMargin, 40, { width: 90 });
    }

    /** Receipt info **/
    const infoTop = 180;
    doc.font('Helvetica-Bold').fontSize(20).fillColor(brandGreen).text('RECEIPT', pageMargin, infoTop);
    doc.moveTo(pageMargin, infoTop + 25).lineTo(pageMargin + 150, infoTop + 25).stroke(brandGreen);

    doc.fontSize(10).fillColor(brandDark).font('Helvetica-Bold')
      .text('Receipt No:', pageWidth - pageMargin - 200, infoTop, { width: 100, align: 'left' })
      .text('Order Date:', pageWidth - pageMargin - 200, infoTop + 15, { width: 100, align: 'left' });

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

    /** Billed To **/
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

    /** Table Header **/
    const tableTop = Math.max(y, 300);
    const col = { sl: 40, gap: 10, unit: 90, qty: 60, total: 90 };
    col.desc = contentWidth - (col.sl + col.gap * 4 + col.unit + col.qty + col.total);

    function drawTableHeader(yPos) {
      doc.rect(pageMargin, yPos, contentWidth, 28).fill(brandDark);
      doc.fontSize(10).fillColor('#FFFFFF').font('Helvetica-Bold');
      doc.text('SL No.', pageMargin + 8, yPos + 9, { width: col.sl - 16, align: 'left' });
      doc.text('Item Description', pageMargin + col.sl + col.gap, yPos + 9, { width: col.desc, align: 'left' });
      doc.text('Unit Price', pageMargin + col.sl + col.gap + col.desc + col.gap, yPos + 9, { width: col.unit, align: 'right' });
      doc.text('Quantity', pageMargin + col.sl + col.gap + col.desc + col.gap + col.unit + col.gap, yPos + 9, { width: col.qty, align: 'center' });
      doc.text('Total', pageMargin + col.sl + col.gap + col.desc + col.gap + col.unit + col.gap + col.qty + col.gap, yPos + 9, { width: col.total, align: 'right' });
    }
    drawTableHeader(tableTop);

    /** Table Rows **/
    let rowY = tableTop + 28;
    let zebra = false;
    let subtotal = 0;

    for (let i = 0; i < items.length; i++) {
      const it = items[i] || {};
      const name = String(it.name ?? it.item ?? '');
      const qty = Number(it.quantity ?? it.qty ?? 0);
      const price = Number(it.price ?? it.unit_price ?? 0);
      const total = qty * price;
      subtotal += total;

      const descH = Math.max(12, doc.heightOfString(name || '-', { width: col.desc }));
      const rowH = Math.max(24, descH + 12);

      // Add new page if needed
      if (rowY + rowH > doc.page.height - 200) {
        doc.addPage();
        addStoreWatermark(doc, 'Town Treasure Groceries');
        rowY = pageMargin;
        drawTableHeader(rowY);
        rowY += 28;
        zebra = false;
      }

      if (zebra) {
        doc.rect(pageMargin, rowY, contentWidth, rowH).fill(lightGray);
        doc.fillColor(brandDark);
      }
      zebra = !zebra;

      doc.fontSize(10).font('Helvetica').fillColor(brandDark);
      doc.text(String(i + 1).padStart(2, '0'), pageMargin + 8, rowY + 8, { width: col.sl - 16, align: 'left' });
      doc.text(name || '-', pageMargin + col.sl + col.gap, rowY + 8, { width: col.desc });
      doc.text(KES(price), pageMargin + col.sl + col.gap + col.desc + col.gap, rowY + 8, { width: col.unit, align: 'right' });
      doc.text(String(qty), pageMargin + col.sl + col.gap + col.desc + col.gap + col.unit + col.gap, rowY + 8, { width: col.qty, align: 'center' });
      doc.text(KES(total), pageMargin + col.sl + col.gap + col.desc + col.gap + col.unit + col.gap + col.qty + col.gap, rowY + 8, { width: col.total, align: 'right' });

      rowY += rowH;
    }

    /** Totals **/
    const sepY = rowY + 6;
    doc.moveTo(pageMargin, sepY).lineTo(pageWidth - pageMargin, sepY).lineWidth(1).strokeColor('#CCCCCC').stroke();

    const totalsY = sepY + 16;
    const labelW = 110;
    const valueW = 110;
    const boxW = labelW + valueW + 20;
    const boxX = pageMargin + contentWidth - boxW;

    doc.font('Helvetica').fontSize(10).fillColor(brandDark);
    doc.text('Sub Total:', boxX, totalsY, { width: labelW, align: 'right' });
    doc.text(KES(subtotal), boxX + labelW, totalsY, { width: valueW, align: 'right' });

    const gtY = totalsY + 28;
    doc.rect(boxX, gtY, boxW, 28).fill('#64B93E');
    doc.font('Helvetica-Bold').fillColor('#FFFFFF');
    doc.text('Grand Total:', boxX, gtY + 7, { width: labelW, align: 'right' });
    doc.text(KES(order.total ?? subtotal), boxX + labelW, gtY + 7, { width: valueW, align: 'right' });

    // --- FOOTER ON EVERY PAGE ---
    const range = doc.bufferedPageRange();
    for (let i = 0; i < range.count; i++) {
      doc.switchToPage(range.start + i);

      const footerY = doc.page.height - 100;
      doc.save()
        .moveTo(0, footerY)
        .quadraticCurveTo(pageWidth / 2, footerY - 50, pageWidth, footerY)
        .lineTo(pageWidth, doc.page.height)
        .lineTo(0, doc.page.height)
        .fill(brandDark);

      // Page numbers on every page
      doc.font('Helvetica').fontSize(10).fillColor('#FFFFFF')
        .text(`Page ${i + 1} of ${range.count}`, pageWidth - pageMargin - 80, footerY + 35, {
          width: 80, align: 'right'
        });
    }

    // Add payment block only on last page
    doc.switchToPage(range.start + range.count - 1);
    const footerY = doc.page.height - 100;
    const blockY = footerY - 220;

    doc.font('Helvetica-Bold').fontSize(12).fillColor(brandDark).text('Payment Details:', pageMargin, blockY);
    doc.font('Helvetica').fontSize(10).fillColor(textGray)
      .text(`M-Pesa Code: ${order.mpesa_receipt_number || 'N/A'}`, pageMargin, blockY + 20);

    // QR with embedded logo circle
    const orderUrl = `https://towntreasuregroceries.netlify.app/account?order=${order.order_number}`;
    const qrDataUrl = await QRCode.toDataURL(orderUrl, { errorCorrectionLevel: 'H' });
    const qrSize = 120;
    const qrX = pageMargin;
    const qrY = blockY + 45;

    doc.image(qrDataUrl, qrX, qrY, { width: qrSize });

    if (fs.existsSync(logoPath)) {
      const logoSize = qrSize * 0.22;
      const cx = qrX + qrSize / 2;
      const cy = qrY + qrSize / 2;
      const r = logoSize / 2 + 6;

      doc.save().circle(cx, cy, r).fill('#FFFFFF').restore();
      doc.save().circle(cx, cy, r).strokeColor('#333D44').lineWidth(3).stroke().restore();
      doc.image(logoPath, cx - logoSize / 2, cy - logoSize / 2, { width: logoSize, height: logoSize });
    }

    doc.fillColor(textGray).fontSize(9)
      .text('Scan here anytime to view and confirm your receipt online.', qrX, qrY + qrSize + 10, {
        width: qrSize, align: 'center'
      });

    // Company info to the right, aligned neatly
    const companyX = pageWidth - pageMargin - 220;
    doc.font('Helvetica').fontSize(9).fillColor(textGray);
    doc.text('Town Treasure Groceries', companyX, blockY, { width: 220, align: 'right' })
      .text('Tel: 0720559925 / 0708567696', companyX, blockY + 12, { width: 220, align: 'right' })
      .text('City Park Market, Limuru Road', companyX, blockY + 24, { width: 220, align: 'right' })
      .text('Nairobi, Kenya', companyX, blockY + 36, { width: 220, align: 'right' });

    /** Thank you note (italic, not bold) **/
    const customerName = order.full_name ? order.full_name.split(' ')[0] : '';
    doc.font('Helvetica-Oblique').fillColor('#FFFFFF').fontSize(14)
      .text(customerName ? `Thank you, ${customerName}, for your business` : 'Thank you for your business',
        0, footerY + 30, { width: pageWidth, align: 'center' });

    /** Stamps (after layout so they don't get overlapped) **/
    if (orderSource === 'paid' || order.payment_status === 'paid') {
      const paidLogoPath = path.resolve(__dirname, 'preloader_stamp.png'); // your personalized stamp image
      addPaidStamp(doc, paidLogoPath, order.created_at);
    } else {
      // Unpaid/Pay on Delivery
      addUnpaidStamp(doc, 'PENDING PAYMENT – COPY');
    }

    /** Finish **/
    doc.end();
    return new Promise((resolve) => {
      doc.on('end', () => {
        const pdfData = Buffer.concat(buffers);
        resolve({
          statusCode: 200,
          headers: {
            'Content-Type': 'application/pdf',
            'Content-Disposition': `attachment; filename="receipt-${order.order_number || orderId}.pdf"`,
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

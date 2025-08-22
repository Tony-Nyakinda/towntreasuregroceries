// netlify/functions/generate-receipt.js

const { createClient } = require('@supabase/supabase-js');
const PDFDocument = require('pdfkit');
const path = require('path');
const fs = require('fs');
const QRCode = require('qrcode');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// --- Watermark helper for unpaid receipts ---
function addWatermark(doc, text) {
  doc.save();
  doc.font('Helvetica-Bold').fontSize(60)
    .fillColor('#E11D48') // red
    .opacity(0.15)
    .rotate(-30, { origin: [doc.page.width / 2, doc.page.height / 2] })
    .text(text, doc.page.width / 4, doc.page.height / 2, {
      align: 'center',
      width: doc.page.width / 2,
    });
  doc.restore();
  doc.opacity(1);
}

// --- Paid Stamp helper ---
function addPaidStamp(doc, logoPath, orderDate) {
  const centerX = doc.page.width / 2;
  const centerY = doc.page.height - 280; // place above footer
  const stampSize = 120;

  // Outer square border with rough "inked" effect
  const boxSize = 180;
  const boxX = centerX - boxSize / 2;
  const boxY = centerY - boxSize / 2;

  doc.save();
  doc.rotate(-15, { origin: [centerX, centerY] }); // tilt whole stamp
  for (let i = 0; i < 3; i++) {
    doc.rect(boxX + i, boxY + i, boxSize, boxSize)
      .lineWidth(2)
      .strokeColor('#1F2937') // dark gray ink
      .opacity(0.6)
      .stroke();
  }

  // Insert the logo inside the box
  if (fs.existsSync(logoPath)) {
    doc.image(logoPath, centerX - stampSize / 2, centerY - stampSize / 2 - 15, {
      width: stampSize,
      height: stampSize,
    });
  }

  // Red ink-styled date
  const dateStr = new Date(orderDate).toLocaleDateString('en-KE', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });

  const textX = centerX - 60;
  const textY = centerY + stampSize / 2 - 5;

  const offsets = [
    { dx: 0, dy: 0 }, { dx: -1, dy: 0 },
    { dx: 1, dy: 0 }, { dx: 0, dy: -1 },
    { dx: 0, dy: 1 }
  ];

  offsets.forEach(({ dx, dy }) => {
    doc.font('Helvetica-Bold')
      .fontSize(16)
      .fillColor('#DC2626') // red ink
      .opacity(0.7)
      .text(dateStr, textX + dx, textY + dy, { width: 120, align: 'center' });
  });

  doc.restore();
  doc.opacity(1);
}

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

    const doc = new PDFDocument({ margin: 0, size: 'A4', bufferPages: true });
    const buffers = [];
    doc.on('data', buffers.push.bind(buffers));

    // Brand theme
    const brandGreen = '#64B93E';
    const brandDark = '#333D44';
    const lightGray = '#F2F2F2';
    const textGray = '#6B7280';
    const pageMargin = 50;
    const pageWidth = doc.page.width;
    const contentWidth = pageWidth - pageMargin * 2;
    const KES = (n) => `KSh ${Number(n || 0).toLocaleString('en-KE')}`;

    // Apply watermark for unpaid receipts only
    if (order.payment_status !== 'paid') {
      addWatermark(doc, 'PENDING PAYMENT – COPY');
    }

    // Header background
    doc.save()
      .moveTo(0, 0).lineTo(pageWidth, 0).lineTo(pageWidth, 120)
      .quadraticCurveTo(pageWidth / 2, 180, 0, 120)
      .fill(brandGreen);

    doc.save()
      .moveTo(pageWidth, 0).lineTo(pageWidth, 80)
      .quadraticCurveTo(pageWidth - 200, 120, pageWidth - 400, 80)
      .lineTo(pageWidth - 400, 0)
      .fill(brandDark);

    // Logo
    const logoPath = path.resolve(__dirname, 'Preloader.png');
    if (fs.existsSync(logoPath)) {
      doc.image(logoPath, pageMargin, 40, { width: 90 });
    }

    // Receipt Info
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

    // Billed To
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

    // Table Header
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

    // Table Rows
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
      if (rowY + rowH > doc.page.height - 200) {
        doc.addPage();
        if (order.payment_status !== 'paid') {
          addWatermark(doc, 'PENDING PAYMENT – COPY');
        }
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

    // Totals
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
    doc.rect(boxX, gtY, boxW, 28).fill(brandGreen);
    doc.font('Helvetica-Bold').fillColor('#FFFFFF');
    doc.text('Grand Total:', boxX, gtY + 7, { width: labelW, align: 'right' });
    doc.text(KES(order.total ?? subtotal), boxX + labelW, gtY + 7, { width: valueW, align: 'right' });

    // Footer decoration
    const footerY = doc.page.height - 100;
    doc.save()
      .moveTo(0, footerY)
      .quadraticCurveTo(pageWidth / 2, footerY - 50, pageWidth, footerY)
      .lineTo(pageWidth, doc.page.height)
      .lineTo(0, doc.page.height)
      .fill(brandDark);

    // QR + company info
    let blockY = footerY - 220;
    doc.font('Helvetica-Bold').fontSize(12).fillColor(brandDark)
      .text('Payment Details:', pageMargin, blockY);
    doc.font('Helvetica').fontSize(10).fillColor(textGray)
      .text(`M-Pesa Code: ${order.mpesa_receipt_number || 'N/A'}`, pageMargin, blockY + 20);

    const orderUrl = `https://towntreasuregroceries.netlify.app/account?order=${order.order_number}`;
    const qrCodeData = await QRCode.toDataURL(orderUrl, { errorCorrectionLevel: 'H' });
    const qrSize = 120;
    const qrX = pageMargin;
    const qrY = blockY + 45;
    doc.image(qrCodeData, qrX, qrY, { width: qrSize });
    if (fs.existsSync(logoPath)) {
      const logoSize = qrSize * 0.22;
      const centerX = qrX + qrSize / 2;
      const centerY = qrY + qrSize / 2;
      const circleRadius = logoSize / 2 + 6;
      doc.save().circle(centerX, centerY, circleRadius).fill('#FFFFFF').restore();
      doc.save().circle(centerX, centerY, circleRadius).strokeColor(brandDark).lineWidth(3).stroke().restore();
      doc.image(logoPath, centerX - logoSize / 2, centerY - logoSize / 2, {
        width: logoSize, height: logoSize
      });
    }
    doc.fillColor(textGray).fontSize(9).text(
      'Scan here anytime to view and confirm your receipt online.',
      qrX,
      qrY + qrSize + 10,
      { width: qrSize, align: 'center' }
    );

    const companyX = pageWidth - pageMargin - 200;
    doc.font('Helvetica').fontSize(9).fillColor(textGray);
    doc.text('Town Treasure Groceries', companyX, blockY, { width: 200, align: 'right' })
       .text('City Park Market, Limuru Road', companyX, blockY + 12, { width: 200, align: 'right' })
       .text('Tel: 0720559925 / 0708567696', companyX, blockY + 24, { width: 200, align: 'right' })
       .text('Nairobi, Kenya', companyX, blockY + 36, { width: 200, align: 'right' });

    // Thank you note
    const customerName = order.full_name ? order.full_name.split(' ')[0] : '';
    const thankYouMsg = customerName
      ? `Thank you, ${customerName}, for your business`
      : 'Thank you for your business';
    doc.font('Helvetica-Oblique').fillColor('#FFFFFF').fontSize(14)
      .text(thankYouMsg, 0, footerY + 30, {
        align: 'center',
        width: pageWidth
      });

    // Page number
    const range = doc.bufferedPageRange();
    const currentPage = range.start + range.count;
    const totalPages = range.count;
    doc.font('Helvetica').fontSize(10).fillColor('#FFFFFF')
      .text(`Page ${currentPage} of ${totalPages}`, pageWidth - pageMargin - 80, footerY + 35, {
        width: 80,
        align: 'right',
      });

    // Add PAID stamp if applicable
    if (order.payment_status === 'paid') {
      const stampPath = path.resolve(__dirname, 'preloader_stamp.png');
      addPaidStamp(doc, stampPath, order.created_at);
    }

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

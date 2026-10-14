import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { formatCurrency, formatDate, formatDateTime } from './format';

/**
 * Generate a professional GST compliant Invoice PDF using jsPDF
 */
export function generateInvoicePDF(sale, shop = {}) {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const shopName = shop.name || shop.shop_name || 'Smart Shop Store';
  const shopAddress = shop.address || 'Commercial Center, Market Road, Mumbai, Maharashtra 400001';
  const shopPhone = shop.phone || '+91 98765 43210';
  const shopEmail = shop.email || 'support@smartshop.local';
  const shopGSTIN = shop.gstin || '27AAAAA0000A1Z5';

  const invoiceNo = sale.invoice_number || sale.invoice_no || `INV-${sale.id || '0001'}`;
  const saleDate = sale.created_at ? formatDateTime(sale.created_at) : formatDate(new Date());
  const customerName = sale.customer_name || sale.customer?.name || 'Walk-in Customer';
  const customerPhone = sale.customer_phone || sale.customer?.phone || '—';
  const customerAddress = sale.customer_address || sale.customer?.address || '—';
  const customerGSTIN = sale.customer_gstin || sale.customer?.gstin || '—';
  const paymentMethod = (sale.payment_method || 'CASH').toUpperCase();

  // Colors
  const primaryColor = [124, 58, 237]; // Violet #7C3AED
  const darkTextColor = [30, 41, 59]; // Slate #1E293B
  const lightTextColor = [100, 116, 139]; // Slate #64748B

  // HEADER BANNER
  doc.setFillColor(15, 23, 42); // Slate 900
  doc.rect(0, 0, 210, 36, 'F');

  // Shop Name & Branding
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(20);
  doc.setFont('helvetica', 'bold');
  doc.text(shopName, 14, 18);

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(203, 213, 225); // Slate 300
  doc.text(`${shopAddress}  |  Ph: ${shopPhone}  |  Email: ${shopEmail}`, 14, 26);
  doc.text(`GSTIN: ${shopGSTIN}`, 14, 31);

  // TAX INVOICE Title Badge
  doc.setFillColor(...primaryColor);
  doc.roundedRect(145, 10, 52, 14, 2, 2, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('TAX INVOICE', 171, 19, { align: 'center' });

  // INVOICE METADATA & CUSTOMER INFO
  let currentY = 46;

  // Left side: Customer
  doc.setTextColor(...darkTextColor);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('Billed To:', 14, currentY);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...lightTextColor);
  doc.text(`Name: ${customerName}`, 14, currentY + 6);
  doc.text(`Phone: ${customerPhone}`, 14, currentY + 11);
  doc.text(`Address: ${customerAddress}`, 14, currentY + 16);
  if (customerGSTIN !== '—') {
    doc.text(`GSTIN: ${customerGSTIN}`, 14, currentY + 21);
  }

  // Right side: Invoice Details
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...darkTextColor);
  doc.text('Invoice Details:', 130, currentY);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...lightTextColor);
  doc.text(`Invoice No: ${invoiceNo}`, 130, currentY + 6);
  doc.text(`Date & Time: ${saleDate}`, 130, currentY + 11);
  doc.text(`Payment Mode: ${paymentMethod}`, 130, currentY + 16);
  doc.text(`Status: ${sale.status ? sale.status.toUpperCase() : 'PAID'}`, 130, currentY + 21);

  currentY += 28;

  // TABLE ITEMS
  const items = sale.items || sale.sale_items || [];
  const tableRows = items.map((item, index) => {
    const qty = Number(item.quantity || 1);
    const rate = Number(item.unit_price || item.price || 0);
    const disc = Number(item.discount || 0);
    const gstPct = Number(item.gst_rate || item.gst_percent || 0);
    const subtotal = qty * rate - disc;
    const taxAmt = (subtotal * gstPct) / 100;
    const total = subtotal + taxAmt;

    return [
      index + 1,
      item.sku || '—',
      item.product_name || item.name || 'General Item',
      qty.toString(),
      `₹${rate.toFixed(2)}`,
      disc > 0 ? `₹${disc.toFixed(2)}` : '₹0.00',
      `${gstPct}%`,
      `₹${total.toFixed(2)}`,
    ];
  });

  autoTable(doc, {
    startY: currentY,
    head: [['#', 'SKU', 'Item Description', 'Qty', 'Rate', 'Disc', 'GST', 'Total']],
    body: tableRows,
    theme: 'grid',
    styles: {
      fontSize: 8,
      cellPadding: 2.5,
      textColor: darkTextColor,
    },
    headStyles: {
      fillColor: [30, 41, 59],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
    },
    columnStyles: {
      0: { cellWidth: 10, halign: 'center' },
      1: { cellWidth: 24 },
      2: { cellWidth: 'auto' },
      3: { cellWidth: 14, halign: 'center' },
      4: { cellWidth: 22, halign: 'right' },
      5: { cellWidth: 18, halign: 'right' },
      6: { cellWidth: 16, halign: 'center' },
      7: { cellWidth: 24, halign: 'right' },
    },
    margin: { left: 14, right: 14 },
  });

  const finalY = doc.lastAutoTable ? doc.lastAutoTable.finalY + 8 : currentY + 40;

  // CALCULATE SUMMARY
  const subtotal = Number(sale.subtotal_amount || sale.subtotal || 0);
  const discountTotal = Number(sale.discount_amount || sale.discount || 0);
  const taxTotal = Number(sale.tax_amount || sale.tax || 0);
  const grandTotal = Number(sale.total_amount || sale.total || (subtotal - discountTotal + taxTotal));

  const cgst = (taxTotal / 2);
  const sgst = (taxTotal / 2);

  // Left Box: Terms & Bank / Notes
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...darkTextColor);
  doc.text('Terms & Conditions:', 14, finalY);

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...lightTextColor);
  doc.text('1. Goods once sold can only be returned within 7 days with valid receipt.', 14, finalY + 5);
  doc.text('2. Please keep this tax invoice for warranty claims & customer support.', 14, finalY + 9);
  doc.text('3. This is a computer-generated tax invoice and requires no physical signature.', 14, finalY + 13);

  if (sale.notes) {
    doc.setFont('helvetica', 'bold');
    doc.text(`Notes: ${sale.notes}`, 14, finalY + 20);
  }

  // Right Box: Calculations
  const boxX = 130;
  let calcY = finalY;

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...darkTextColor);

  doc.text('Subtotal:', boxX, calcY);
  doc.text(`₹${subtotal.toFixed(2)}`, 196, calcY, { align: 'right' });

  if (discountTotal > 0) {
    calcY += 6;
    doc.setTextColor(220, 38, 38);
    doc.text('Discount:', boxX, calcY);
    doc.text(`-₹${discountTotal.toFixed(2)}`, 196, calcY, { align: 'right' });
    doc.setTextColor(...darkTextColor);
  }

  calcY += 6;
  doc.text('CGST (Central):', boxX, calcY);
  doc.text(`₹${cgst.toFixed(2)}`, 196, calcY, { align: 'right' });

  calcY += 6;
  doc.text('SGST (State):', boxX, calcY);
  doc.text(`₹${sgst.toFixed(2)}`, 196, calcY, { align: 'right' });

  calcY += 4;
  doc.setDrawColor(203, 213, 225);
  doc.line(boxX, calcY, 196, calcY);

  calcY += 7;
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...primaryColor);
  doc.text('Grand Total:', boxX, calcY);
  doc.text(`₹${grandTotal.toFixed(2)}`, 196, calcY, { align: 'right' });

  // Footer bar
  doc.setFontSize(8);
  doc.setFont('helvetica', 'italic');
  doc.setTextColor(...lightTextColor);
  doc.text('Thank you for shopping with us! Visit again.', 105, 285, { align: 'center' });

  // Save the PDF
  doc.save(`${invoiceNo}.pdf`);
  return doc;
}

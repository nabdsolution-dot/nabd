import 'package:pdf/pdf.dart';
import 'package:pdf/widgets.dart' as pw;
import 'package:printing/printing.dart';

import 'models.dart';

/// Prints an 80 mm receipt through the system print dialog (works with any installed printer).
/// Uses the built-in Latin font. Arabic product names need a bundled Arabic font (planned).
Future<void> printReceipt(Map<String, dynamic> sale, int lbpRate) async {
  final doc = pw.Document();
  final lines = (sale['_lines'] as List).map((e) => Map<String, dynamic>.from(e as Map)).toList();
  final total = sale['_total'] as int;
  final discount = sale['discountCents'] as int;
  final bold = pw.TextStyle(fontWeight: pw.FontWeight.bold);

  pw.Widget row(String a, String b, {pw.TextStyle? style}) =>
      pw.Row(mainAxisAlignment: pw.MainAxisAlignment.spaceBetween, children: [pw.Text(a, style: style), pw.Text(b, style: style)]);

  doc.addPage(pw.Page(
    pageFormat: PdfPageFormat.roll80,
    build: (_) => pw.Column(crossAxisAlignment: pw.CrossAxisAlignment.start, children: [
      pw.Center(child: pw.Text('NABD', style: pw.TextStyle(fontSize: 18, fontWeight: pw.FontWeight.bold))),
      pw.SizedBox(height: 6),
      pw.Text('Receipt ${sale['receiptNo']}'),
      pw.Text('${sale['soldAt']}'.replaceFirst('T', ' ').split('.').first + ' UTC'),
      pw.Text('Cashier: ${sale['_cashier'] ?? ''}'),
      pw.Divider(),
      for (final l in lines)
        row('${l['qty']} x ${l['name']}', usd((l['unit'] as int) * (l['qty'] as int))),
      pw.Divider(),
      row('Subtotal', usd(sale['_subtotal'] as int)),
      if (discount > 0) row('Discount', '-${usd(discount)}'),
      row('VAT', usd(sale['_vat'] as int)),
      row('TOTAL', usd(total), style: bold),
      pw.Text(lbp(total, lbpRate)),
      pw.SizedBox(height: 6),
      pw.Text('Paid by: ${sale['tender']}'.toUpperCase()),
      pw.SizedBox(height: 10),
      pw.Center(child: pw.Text('Thank you')),
    ]),
  ));

  await Printing.layoutPdf(onLayout: (_) async => doc.save(), name: 'Receipt ${sale['receiptNo']}');
}

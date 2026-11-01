import 'package:flutter_test/flutter_test.dart';
import 'package:nabd_cashier/models.dart';

void main() {
  final croissant = Product(id: 'a', name: 'Croissant', barcode: null, category: 'Bakery', priceCents: 225, vatBp: 1100);

  test('totals add VAT and match the server maths', () {
    final t = computeTotals([CartLine(croissant, 2)], 0);
    expect(t.subtotal, 450);
    expect(t.vat, 50); // 450 * 11% = 49.5, rounds to 50
    expect(t.total, 500);
  });

  test('discount reduces VAT proportionally', () {
    final t = computeTotals([CartLine(croissant, 2)], 45);
    expect(t.total, 450 - 45 + 45); // vat 44.55 rounds to 45
  });

  test('money formatting', () {
    expect(usd(500), '\$5.00');
    expect(lbp(500, 89500), '447,500 LBP');
  });
}

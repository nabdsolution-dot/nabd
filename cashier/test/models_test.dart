import 'package:flutter_test/flutter_test.dart';
import 'package:nabd_cashier/models.dart';
import 'package:nabd_cashier/promo.dart';

void main() {
  final croissant = Product(id: 'a', name: 'Croissant', barcode: null, category: 'Bakery', priceCents: 225, vatBp: 1100);

  test('totals add VAT and match the server maths', () {
    final t = computeTotals([CartLine(croissant, 2)]);
    expect(t.subtotal, 450);
    expect(t.vat, 50); // 450 * 11% = 49.5, rounds to 50
    expect(t.total, 500);
  });

  test('discount reduces VAT proportionally', () {
    final t = computeTotals([CartLine(croissant, 2)], orderPct: 10);
    expect(t.total, 450 - 45 + 45); // vat 44.55 rounds to 45
  });

  test('money formatting', () {
    expect(usd(500), '\$5.00');
    expect(lbp(500, 89500), '447,500 LBP');
  });

  Product p(String id, int cents) => Product(id: id, name: id, barcode: null, category: 'x', priceCents: cents, vatBp: 1100);

  test('promotions, points and VAT match the server (777 cents, 7 points)', () {
    final cheese = p('cheese', 250), zaatar = p('zaatar', 175), coffee = p('coffee', 150);
    final promos = [
      Promo(id: 'b', name: 'Any 2 manousheh', kind: 'bundle', productIds: ['cheese', 'zaatar'], qty: 2, priceCents: 400),
      Promo(id: 'g', name: 'Coffee 3', kind: 'buy_get', productIds: ['coffee'], qty: 3, percent: 100),
    ];
    final t = computeTotals([CartLine(cheese, 1), CartLine(zaatar, 1), CartLine(coffee, 3)],
        promos: promos, hasCustomer: true);
    expect(t.subtotal, 875);
    expect(t.promoOff, 175);
    expect(t.vat, 77);
    expect(t.total, 777);
    expect(t.earned, 7);
  });

  test('redeemed points cannot exceed the sale and reduce VAT', () {
    final t = computeTotals([CartLine(croissant, 2)], redeem: 1000, hasCustomer: true);
    expect(t.pointsOff, 450); // capped at the net sub total, 1 point = 1 cent
    expect(t.total, 0);
  });

  test('line discount applies after promotions', () {
    final t = computeTotals([CartLine(croissant, 2, 10)]);
    expect(t.manualLine, 45);
    expect(t.subtotal - t.lineOff, 405);
  });
}

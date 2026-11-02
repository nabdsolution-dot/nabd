import 'dart:convert';
import 'dart:typed_data';

import 'promo.dart';

class Product {
  Product({
    required this.id,
    required this.name,
    required this.barcode,
    required this.category,
    required this.priceCents,
    required this.vatBp,
    this.image,
  });

  final String id;
  final String name;
  final String? barcode;
  final String category;
  final int priceCents;
  final int vatBp;

  /// A small picture as a data URL, or null.
  final String? image;
  Uint8List? _bytes;
  bool _decoded = false;

  Uint8List? get imageBytes {
    if (!_decoded) {
      _decoded = true;
      final i = image;
      if (i != null && i.contains(',')) {
        try {
          _bytes = base64Decode(i.substring(i.indexOf(',') + 1));
        } catch (_) {
          _bytes = null;
        }
      }
    }
    return _bytes;
  }

  factory Product.fromJson(Map<String, dynamic> j) => Product(
        id: j['id'] as String,
        name: j['name'] as String,
        barcode: j['barcode'] as String?,
        category: (j['category'] as String?) ?? 'Other',
        priceCents: (j['priceCents'] as num).toInt(),
        vatBp: (j['vatBp'] as num).toInt(),
        image: j['image'] as String?,
      );

  Map<String, dynamic> toJson() => {
        'id': id,
        'name': name,
        'barcode': barcode,
        'category': category,
        'priceCents': priceCents,
        'vatBp': vatBp,
        'image': image,
      };
}

class CartLine {
  CartLine(this.product, this.qty, [this.discountPct = 0]);
  final Product product;
  int qty;
  int discountPct;
  int get totalCents => product.priceCents * qty;
}

class Loyalty {
  const Loyalty({this.enabled = true, this.earnPerUsd = 1, this.pointValueCents = 1});
  final bool enabled;
  final int earnPerUsd;
  final int pointValueCents;
  factory Loyalty.fromJson(Map<String, dynamic> j) => Loyalty(
        enabled: j['enabled'] != false,
        earnPerUsd: (j['earnPerUsd'] as num?)?.toInt() ?? 1,
        pointValueCents: ((j['pointValueCents'] as num?)?.toInt() ?? 1).clamp(1, 1000000).toInt(),
      );
  Map<String, dynamic> toJson() => {'enabled': enabled, 'earnPerUsd': earnPerUsd, 'pointValueCents': pointValueCents};
}

class Customer {
  Customer({required this.id, required this.name, this.phone, this.points = 0, this.balanceCents = 0, this.creditLimitCents = 0});
  final String id;
  final String name;
  final String? phone;
  final int points;
  final int balanceCents;
  final int creditLimitCents;
  int get room => creditLimitCents - balanceCents;
  factory Customer.fromJson(Map<String, dynamic> j) => Customer(
        id: j['id'] as String,
        name: j['name'] as String,
        phone: j['phone'] as String?,
        points: (j['points'] as num?)?.toInt() ?? 0,
        balanceCents: (j['balanceCents'] as num?)?.toInt() ?? 0,
        creditLimitCents: (j['creditLimitCents'] as num?)?.toInt() ?? 0,
      );
}

class LineCalc {
  LineCalc(this.gross, this.promo, this.manual, this.promoId);
  final int gross;
  final int promo;
  final int manual;
  final String? promoId;
}

class Totals {
  Totals({
    required this.subtotal, required this.lineOff, required this.promoOff, required this.manualLine,
    required this.orderManual, required this.pointsOff, required this.vat, required this.total,
    required this.earned, required this.promoNames, required this.lines, required this.maxRedeem,
  });
  final int subtotal;
  final int lineOff;
  final int promoOff;
  final int manualLine;
  final int orderManual;
  final int pointsOff;
  final int vat;
  final int total;
  final int earned;
  final List<String> promoNames;
  final List<LineCalc> lines;
  final int maxRedeem;
  int get discount => lineOff + orderManual + pointsOff;
}

/// Same arithmetic as the server and the web till, so every screen agrees to the cent.
Totals computeTotals(
  List<CartLine> lines, {
  List<Promo> promos = const [],
  int orderPct = 0,
  int redeem = 0,
  Loyalty loyalty = const Loyalty(),
  bool hasCustomer = false,
}) {
  final res = applyPromos(lines.map((l) => PromoLine(l.product.id, l.qty, l.product.priceCents)).toList(), promos);
  final calc = <LineCalc>[];
  for (var i = 0; i < lines.length; i++) {
    final gross = lines[i].totalCents;
    final promo = res.promoCents[i] < gross ? res.promoCents[i] : gross;
    final manual = ((gross - promo) * lines[i].discountPct / 100).round();
    calc.add(LineCalc(gross, promo, manual, res.promoIds[i]));
  }
  final subtotal = calc.fold<int>(0, (a, c) => a + c.gross);
  final promoOff = calc.fold<int>(0, (a, c) => a + c.promo);
  final manualLine = calc.fold<int>(0, (a, c) => a + c.manual);
  final lineOff = promoOff + manualLine;
  final netSub = subtotal - lineOff;
  final om = (netSub * orderPct / 100).round();
  final orderManual = om < netSub ? om : netSub;
  final maxRedeem = loyalty.enabled && hasCustomer ? ((netSub - orderManual) ~/ loyalty.pointValueCents).clamp(0, 1 << 30).toInt() : 0;
  final pointsOff = (redeem < maxRedeem ? redeem : maxRedeem) * loyalty.pointValueCents;
  final orderOff = orderManual + pointsOff;
  var vatRaw = 0.0;
  for (var i = 0; i < lines.length; i++) {
    vatRaw += (calc[i].gross - calc[i].promo - calc[i].manual) * lines[i].product.vatBp / 10000;
  }
  final vat = netSub == 0 ? 0 : (vatRaw * (netSub - orderOff) / netSub).round();
  final total = netSub - orderOff + vat;
  final earned = hasCustomer && loyalty.enabled ? total * loyalty.earnPerUsd ~/ 100 : 0;
  return Totals(
    subtotal: subtotal, lineOff: lineOff, promoOff: promoOff, manualLine: manualLine, orderManual: orderManual,
    pointsOff: pointsOff, vat: vat, total: total, earned: earned, promoNames: res.names, lines: calc, maxRedeem: maxRedeem,
  );
}

/// A built-in picture for an item without an uploaded photo.
String iconFor(String name) {
  const map = <List<String>>[
    ['coffee|espresso|latte|cappuccino|nescafe|قهوة', '☕'], ['tea|شاي', '🍵'], ['juice|عصير|orange', '🧃'], ['water|مياه|sparkl', '💧'],
    ['jallab|drink|soda|cola|pepsi', '🥤'], ['beer|بيرة', '🍺'], ['wine|نبيذ', '🍷'],
    ['croissant', '🥐'], ['manoush|zaatar|pizza|pie|فطير|منقوش', '🥙'], ['ka.?ak|bread|خبز|bagel|toast', '🥖'], ['cake|كعك|cookie|biscuit|حلو|sweet', '🍰'],
    ['cheese|halloumi|جبن|حلوم', '🧀'], ['labneh|milk|yogh?urt|dairy|لبن|حليب', '🥛'], ['egg|بيض', '🥚'],
    ['chicken|دجاج', '🍗'], ['meat|beef|lamb|لحم|burger', '🍔'], ['fish|سمك|tuna', '🐟'],
    ['apple|تفاح', '🍎'], ['banana|موز', '🍌'], ['fruit|فاكه', '🍇'], ['tomato|بندور', '🍅'], ['vegetable|potato|خضار|salad', '🥗'],
    ['chocolate|شوكولا', '🍫'], ['chips|snack', '🍿'], ['rice|pasta|أرز', '🍚'], ['soap|shampoo|clean|صابون', '🧼'], ['paper|tissue|ورق', '🧻'],
  ];
  for (final e in map) {
    if (RegExp(e[0], caseSensitive: false).hasMatch(name)) return e[1];
  }
  return '🛒';
}

String usd(int cents) => '\$${(cents / 100).toStringAsFixed(2)}';

String lbp(int cents, int rate) {
  final v = (cents / 100 * rate).round();
  final s = v.toString().replaceAllMapped(RegExp(r'\B(?=(\d{3})+(?!\d))'), (_) => ',');
  return '$s LBP';
}

/// "12.5" -> 1250. Returns null when the text is not a number.
int? parseCents(String text) {
  final d = double.tryParse(text.trim().replaceAll(',', '.'));
  if (d == null || d < 0) return null;
  return (d * 100).round();
}

int? parseWhole(String text) {
  final d = int.tryParse(text.trim().replaceAll(',', '').replaceAll(' ', ''));
  if (d == null || d < 0) return null;
  return d;
}

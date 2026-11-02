/// Promotion engine. Same rules as server/src/promo.ts and the web till, so the price
/// on the screen is the price that is saved. Money is integer cents.
class Promo {
  Promo({required this.id, required this.name, required this.kind, required this.productIds, required this.qty, this.priceCents, this.percent});
  final String id;
  final String name;
  final String kind; // bundle | percent | buy_get
  final List<String> productIds;
  final int qty;
  final int? priceCents;
  final int? percent;

  factory Promo.fromJson(Map<String, dynamic> j) => Promo(
        id: j['id'] as String,
        name: j['name'] as String,
        kind: j['kind'] as String,
        productIds: ((j['productIds'] as List?) ?? []).map((e) => e.toString()).toList(),
        qty: (j['qty'] as num).toInt(),
        priceCents: (j['priceCents'] as num?)?.toInt(),
        percent: (j['percent'] as num?)?.toInt(),
      );

  Map<String, dynamic> toJson() => {
        'id': id, 'name': name, 'kind': kind, 'productIds': productIds, 'qty': qty, 'priceCents': priceCents, 'percent': percent,
      };
}

class PromoLine {
  PromoLine(this.productId, this.qty, this.unitCents);
  final String productId;
  final int qty;
  final int unitCents;
}

class PromoResult {
  PromoResult(this.promoCents, this.promoIds, this.names);
  final List<int> promoCents;
  final List<String?> promoIds;
  final List<String> names;
}

class _U {
  _U(this.i, this.unit);
  final int i;
  final int unit;
}

/// For each line, the cents taken off by promotions. A unit joins at most one promotion.
PromoResult applyPromos(List<PromoLine> lines, List<Promo> promos) {
  final promoCents = List<int>.filled(lines.length, 0);
  final promoIds = List<String?>.filled(lines.length, null);
  final names = <String>[];
  final free = lines.map((l) => l.qty).toList();

  for (final p in promos) {
    final pool = <_U>[];
    for (var i = 0; i < lines.length; i++) {
      if (!p.productIds.contains(lines[i].productId)) continue;
      for (var k = 0; k < free[i]; k++) {
        pool.add(_U(i, lines[i].unitCents));
      }
    }
    if (pool.length < p.qty || p.qty <= 0) continue;
    // Dearest first. Dart's sort is not stable, so break ties by line index to match the server.
    final indexed = pool.asMap().entries.toList()
      ..sort((a, b) {
        final c = b.value.unit.compareTo(a.value.unit);
        return c != 0 ? c : a.key.compareTo(b.key);
      });
    final sorted = indexed.map((e) => e.value).toList();
    final saved = List<int>.filled(lines.length, 0);
    final used = List<int>.filled(lines.length, 0);
    var total = 0;

    if (p.kind == 'bundle' && p.priceCents != null) {
      for (var g = 0; g + p.qty <= sorted.length; g += p.qty) {
        final group = sorted.sublist(g, g + p.qty);
        final sum = group.fold<int>(0, (a, x) => a + x.unit);
        final off = sum - p.priceCents!;
        if (off <= 0) continue;
        var left = off;
        for (var k = 0; k < group.length; k++) {
          final x = group[k];
          final share = k == group.length - 1 ? left : (off * x.unit) ~/ sum;
          left -= share;
          saved[x.i] += share;
          used[x.i]++;
        }
        total += off;
      }
    } else if (p.kind == 'percent' && p.percent != null) {
      for (final x in sorted) {
        final off = (x.unit * p.percent! / 100).round();
        saved[x.i] += off;
        used[x.i]++;
        total += off;
      }
    } else if (p.kind == 'buy_get' && p.percent != null) {
      for (var g = 0; g + p.qty <= sorted.length; g += p.qty) {
        final group = sorted.sublist(g, g + p.qty);
        final cheapest = group.last;
        final off = (cheapest.unit * p.percent! / 100).round();
        saved[cheapest.i] += off;
        total += off;
        for (final x in group) {
          used[x.i]++;
        }
      }
    }
    if (total <= 0) continue;
    names.add(p.name);
    for (var i = 0; i < lines.length; i++) {
      if (saved[i] > 0 || used[i] > 0) {
        promoCents[i] += saved[i];
        if (saved[i] > 0) promoIds[i] = p.id;
        free[i] -= used[i];
      }
    }
  }
  return PromoResult(promoCents, promoIds, names);
}

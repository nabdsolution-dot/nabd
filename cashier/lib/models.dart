import 'dart:convert';
import 'dart:typed_data';

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
  CartLine(this.product, this.qty);
  final Product product;
  int qty;
  int get totalCents => product.priceCents * qty;
}

class Totals {
  Totals(this.subtotal, this.discount, this.vat) : total = subtotal - discount + vat;
  final int subtotal;
  final int discount;
  final int vat;
  final int total;
}

/// Same arithmetic as the server, so the till and the back office agree to the cent.
Totals computeTotals(List<CartLine> lines, int discountCents) {
  var subtotal = 0;
  var vatRaw = 0.0;
  for (final l in lines) {
    subtotal += l.totalCents;
    vatRaw += l.totalCents * l.product.vatBp / 10000;
  }
  final vat = subtotal == 0 ? 0 : (vatRaw * (subtotal - discountCents) / subtotal).round();
  return Totals(subtotal, discountCents, vat);
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

import 'dart:async';
import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:uuid/uuid.dart';

import 'api.dart';
import 'models.dart';
import 'strings.dart';

const appVersion = '1.3.0';

class AppState extends ChangeNotifier {
  late SharedPreferences _prefs;
  Api? api;

  String serverUrl = '';
  String storeId = '';
  String tillId = '';

  String? cashierName;
  String roleId = '';
  String lang = 'en';
  String themeMode = 'system'; // system | light | dark
  double zoom = 1.0;
  String accent = 'green';
  String gridSize = 'm'; // s | m | l
  String cartPos = 'auto'; // auto | side | bottom
  bool cartOpen = true;
  bool headerShown = true;
  String roleName = '';
  String storeName = '';
  String email = '';
  String? updateVersion; // set when the server knows a newer app version
  String updateUrl = '';
  bool updateDismissed = false;
  DateTime? _lastUpdateCheck;
  Map<String, dynamic>? shift;
  Set<String> permissions = {};

  List<Product> products = [];
  int lbpRate = 89500;
  bool online = false;
  bool ready = false;
  String? syncMessage;

  /// Sales that are finished at the till but not yet accepted by the server.
  List<Map<String, dynamic>> queue = [];
  /// Sales the server refused (for example a discount the cashier may not give).
  List<Map<String, dynamic>> rejected = [];

  final List<CartLine> cart = [];
  int discountPercent = 0;
  Timer? _timer;
  bool _syncing = false;

  bool get configured => serverUrl.isNotEmpty && storeId.isNotEmpty && tillId.isNotEmpty;
  bool get signedIn => api?.token != null && cashierName != null;

  Future<void> init() async {
    _prefs = await SharedPreferences.getInstance();
    serverUrl = _prefs.getString('serverUrl') ?? '';
    storeId = _prefs.getString('storeId') ?? '';
    tillId = _prefs.getString('tillId') ?? '';
    lbpRate = _prefs.getInt('lbpRate') ?? 89500;
    lang = _prefs.getString('lang') ?? 'en';
    themeMode = _prefs.getString('themeMode') ?? 'system';
    accent = _prefs.getString('accent') ?? 'green';
    gridSize = _prefs.getString('gridSize') ?? 'm';
    cartPos = _prefs.getString('cartPos') ?? 'auto';
    cartOpen = _prefs.getBool('cartOpen') ?? true;
    headerShown = _prefs.getBool('headerShown') ?? true;
    zoom = (_prefs.getDouble('zoom') ?? 1.0).clamp(0.7, 1.8);
    currentLang = lang;
    queue = _readList('queue');
    rejected = _readList('rejected');
    final cached = _prefs.getString('products');
    if (cached != null) {
      products = (jsonDecode(cached) as List)
          .map((e) => Product.fromJson(e as Map<String, dynamic>))
          .toList();
    }
    if (configured) api = Api(serverUrl);
    ready = true;
    unawaited(checkUpdate());
    _timer = Timer.periodic(const Duration(seconds: 30), (_) => sync());
    notifyListeners();
  }

  List<Map<String, dynamic>> _readList(String key) {
    final raw = _prefs.getString(key);
    if (raw == null) return [];
    return (jsonDecode(raw) as List).map((e) => Map<String, dynamic>.from(e as Map)).toList();
  }

  Future<void> _save() async {
    await _prefs.setString('queue', jsonEncode(queue));
    await _prefs.setString('rejected', jsonEncode(rejected));
  }

  Future<void> saveSetup(String url, String store, String till) async {
    serverUrl = url.trim().replaceAll(RegExp(r'/+$'), '');
    storeId = store.trim();
    tillId = till.trim();
    await _prefs.setString('serverUrl', serverUrl);
    await _prefs.setString('storeId', storeId);
    await _prefs.setString('tillId', tillId);
    api = Api(serverUrl);
    notifyListeners();
  }

  Future<void> resetSetup() async {
    serverUrl = storeId = tillId = '';
    await _prefs.remove('serverUrl');
    await _prefs.remove('storeId');
    await _prefs.remove('tillId');
    signOut();
  }

  /// Signs in with a PIN. Needs the server once; selling afterwards works offline.
  Future<void> signIn(String pin) async {
    final a = api!;
    final res = await a.post('/auth/pin', {'storeId': storeId, 'pin': pin});
    a.token = (res as Map)['token'] as String;
    final me = await a.get('/me') as Map;
    cashierName = me['name'] as String;
    roleId = (me['roleId'] as String?) ?? '';
    roleName = (me['roleName'] as String?) ?? roleId;
    storeName = (me['storeName'] as String?) ?? '';
    email = (me['email'] as String?) ?? '';
    permissions = ((me['permissions'] as List?) ?? []).map((e) => e.toString()).toSet();
    online = true;
    notifyListeners();
    unawaited(sync());
  }

  void signOut() {
    api?.token = null;
    cashierName = null;
    roleId = '';
    shift = null;
    permissions = {};
    cart.clear();
    discountPercent = 0;
    notifyListeners();
  }

  // ---- cart ----
  void add(Product p) {
    final i = cart.indexWhere((l) => l.product.id == p.id);
    if (i >= 0) {
      cart[i].qty++;
    } else {
      cart.add(CartLine(p, 1));
    }
    notifyListeners();
  }

  void changeQty(CartLine l, int delta) {
    l.qty += delta;
    if (l.qty <= 0) cart.remove(l);
    notifyListeners();
  }

  void clearCart() {
    cart.clear();
    discountPercent = 0;
    notifyListeners();
  }

  void setDiscount(int percent) {
    discountPercent = percent;
    notifyListeners();
  }

  int get discountCents {
    final sub = cart.fold<int>(0, (a, l) => a + l.totalCents);
    return (sub * discountPercent / 100).round();
  }

  Totals get totals => computeTotals(cart, discountCents);

  bool get canDiscount10 => permissions.contains('discount_over_5');

  // ---- sale ----
  /// Completes the sale at the till and queues it. Never waits for the network.
  Future<Map<String, dynamic>> completeSale(String tender) async {
    final counter = (_prefs.getInt('receiptCounter') ?? 0) + 1;
    await _prefs.setInt('receiptCounter', counter);
    final code = tillId.replaceAll('-', '').substring(0, 4).toUpperCase();
    final t = totals;
    final sale = <String, dynamic>{
      'id': const Uuid().v4(),
      'storeId': storeId,
      'tillId': tillId,
      'receiptNo': '$code-${counter.toString().padLeft(5, '0')}',
      'soldAt': DateTime.fromMillisecondsSinceEpoch(
              DateTime.now().millisecondsSinceEpoch, isUtc: true)
          .toIso8601String(),
      'tender': tender,
      'discountCents': t.discount,
      'lbpRate': lbpRate,
      'lines': cart.map((l) => {'productId': l.product.id, 'qty': l.qty}).toList(),
      // display only, the server recomputes totals
      '_total': t.total,
      '_subtotal': t.subtotal,
      '_vat': t.vat,
      '_cashier': cashierName,
      '_lines': cart.map((l) => {'name': l.product.name, 'qty': l.qty, 'unit': l.product.priceCents}).toList(),
    };
    queue.add(sale);
    await _save();
    cart.clear();
    discountPercent = 0;
    notifyListeners();
    unawaited(sync());
    return sale;
  }

  // ---- display ----
  Future<void> setThemeMode(String m) async {
    themeMode = m;
    await _prefs.setString('themeMode', m);
    notifyListeners();
  }

  Future<void> setGridSize(String v) async {
    gridSize = v;
    await _prefs.setString('gridSize', v);
    notifyListeners();
  }

  Future<void> setCartPos(String v) async {
    cartPos = v;
    await _prefs.setString('cartPos', v);
    notifyListeners();
  }

  Future<void> setCartOpen(bool v) async {
    cartOpen = v;
    await _prefs.setBool('cartOpen', v);
    notifyListeners();
  }

  Future<void> setHeaderShown(bool v) async {
    headerShown = v;
    await _prefs.setBool('headerShown', v);
    notifyListeners();
  }

  Future<void> changePin(String current, String next) async {
    await api!.post('/me/pin', {'currentPin': current, 'newPin': next});
  }

  Future<void> setAccent(String a) async {
    accent = a;
    await _prefs.setString('accent', a);
    notifyListeners();
  }

  Future<void> setZoom(double z) async {
    zoom = double.parse(z.clamp(0.7, 1.8).toStringAsFixed(2));
    await _prefs.setDouble('zoom', zoom);
    notifyListeners();
  }

  // ---- language ----
  Future<void> setLang(String l) async {
    lang = l;
    currentLang = l;
    await _prefs.setString('lang', l);
    notifyListeners();
  }

  // ---- shifts and returns (these need the connection) ----
  String _nextReceipt(String prefix) {
    final counter = (_prefs.getInt('receiptCounter') ?? 0) + 1;
    _prefs.setInt('receiptCounter', counter);
    final code = tillId.replaceAll('-', '').substring(0, 4).toUpperCase();
    return '$prefix$code-${counter.toString().padLeft(5, '0')}';
  }

  Future<void> loadShift() async {
    final r = await api!.get('/shifts/current', {'tillId': tillId}) as Map;
    shift = r['open'] == true ? Map<String, dynamic>.from(r) : null;
    notifyListeners();
  }

  Future<void> openShift(int floatUsdCents) async {
    await api!.post('/shifts/open', {'tillId': tillId, 'floatUsdCents': floatUsdCents});
    await loadShift();
  }

  Future<Map> closeShift(int usdCents, int lbp, int cardCents, String note) async {
    final res = await api!.post('/shifts/${shift!['id']}/close', {
      'countedUsdCents': usdCents,
      'countedLbp': lbp,
      'countedCardCents': cardCents,
      if (note.trim().isNotEmpty) 'note': note.trim(),
    }) as Map;
    shift = null;
    notifyListeners();
    return res;
  }

  Future<Map> lookupSale(String receiptNo) async =>
      await api!.get('/sales/lookup', {'storeId': storeId, 'receiptNo': receiptNo.trim()}) as Map;

  Future<int> submitReturn({
    required String saleId,
    required String tender,
    required List<Map<String, dynamic>> lines,
    String? reason,
    String? approverPin,
  }) async {
    final res = await api!.post('/returns', {
      'id': const Uuid().v4(),
      'saleId': saleId,
      'tillId': tillId,
      'receiptNo': _nextReceipt('R'),
      'tender': tender,
      'lines': lines,
      if (reason != null && reason.trim().isNotEmpty) 'reason': reason.trim(),
      if (approverPin != null && approverPin.isNotEmpty) 'approverPin': approverPin,
    }) as Map;
    return (res['refundCents'] as num?)?.toInt() ?? 0;
  }

  // ---- app updates ----
  static bool _newer(String latest, String current) {
    List<int> parts(String v) => v.split('+').first.split('.').map((x) => int.tryParse(x) ?? 0).toList();
    final a = parts(latest), b = parts(current);
    for (var i = 0; i < 3; i++) {
      final x = i < a.length ? a[i] : 0, y = i < b.length ? b[i] : 0;
      if (x != y) return x > y;
    }
    return false;
  }

  /// Asks the server for the newest app version. Quiet on any failure.
  Future<void> checkUpdate({bool force = false}) async {
    final a = api;
    if (a == null) return;
    final last = _lastUpdateCheck;
    if (!force && last != null && DateTime.now().difference(last) < const Duration(hours: 6)) return;
    _lastUpdateCheck = DateTime.now();
    try {
      final r = await a.get('/app/version');
      final latest = (r is Map ? r['latest'] : null)?.toString() ?? '';
      if (latest.isNotEmpty && _newer(latest, appVersion)) {
        if (updateVersion != latest) updateDismissed = false;
        updateVersion = latest;
        updateUrl = (r['url'] ?? '').toString();
      } else {
        updateVersion = null;
      }
      notifyListeners();
    } catch (_) {
      // Offline or an older server without this route: no banner.
    }
  }

  void dismissUpdate() {
    updateDismissed = true;
    notifyListeners();
  }

  // ---- sync ----
  Future<void> sync() async {
    final a = api;
    if (_syncing || a == null || a.token == null) return;
    _syncing = true;
    try {
      await _flushQueue(a);
      await _loadCatalogue(a);
      await a.post('/tills/$tillId/heartbeat',
          {'appVersion': appVersion, 'queuedSales': queue.length});
      online = true;
      syncMessage = null;
      unawaited(checkUpdate());
    } on OfflineException {
      online = false;
    } on ApiException catch (e) {
      if (e.status == 401) {
        syncMessage = 'Signed out. Sign in again to upload waiting sales.';
        signOut();
      } else {
        syncMessage = e.message;
      }
    } finally {
      _syncing = false;
      notifyListeners();
    }
  }

  Future<void> _flushQueue(Api a) async {
    for (final sale in List<Map<String, dynamic>>.from(queue)) {
      final body = Map<String, dynamic>.from(sale)..removeWhere((k, _) => k.startsWith('_'));
      try {
        await a.post('/sales', body); // 200 duplicate and 201 created both mean "saved"
        queue.remove(sale);
      } on ApiException catch (e) {
        if (e.status == 401) rethrow;
        // The server understood and refused. Park it so it cannot block the others.
        queue.remove(sale);
        rejected.add({...sale, '_reason': e.message});
      }
      await _save();
    }
  }

  Future<void> _loadCatalogue(Api a) async {
    final all = <Product>[];
    var page = 1;
    while (true) {
      final res = await a.get('/products', {'limit': '200', 'page': '$page'}) as Map;
      final items = (res['items'] as List).cast<Map<String, dynamic>>();
      for (final j in items) {
        if (j['active'] == true) all.add(Product.fromJson(j));
      }
      if (page * 200 >= (res['total'] as num).toInt()) break;
      page++;
    }
    products = all;
    await _prefs.setString('products', jsonEncode(all.map((p) => p.toJson()).toList()));
    final s = await a.get('/settings') as Map;
    lbpRate = (s['lbpRate'] as num).toInt();
    await _prefs.setInt('lbpRate', lbpRate);
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }
}

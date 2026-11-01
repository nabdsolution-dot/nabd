import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'api.dart';
import 'app_state.dart';
import 'models.dart';
import 'receipt.dart';
import 'screens_extra.dart';
import 'strings.dart';

const cedar = Color(0xFF0E5A48);
const cedarDeep = Color(0xFF0B4A3B);
const saffron = Color(0xFFF0A500);
const ink = Color(0xFF12201C);
const mist = Color(0xFFF2F4F1);
const slate = Color(0xFF55655F);
const line = Color(0xFFD5DCD9);
const waiting = Color(0xFFFFF1CC);
const alertRed = Color(0xFFB3261E);

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  SystemChrome.setPreferredOrientations(
      [DeviceOrientation.landscapeLeft, DeviceOrientation.landscapeRight]);
  runApp(const NabdCashierApp());
}

class NabdCashierApp extends StatefulWidget {
  const NabdCashierApp({super.key});
  @override
  State<NabdCashierApp> createState() => _NabdCashierAppState();
}

class _NabdCashierAppState extends State<NabdCashierApp> {
  final state = AppState();

  @override
  void initState() {
    super.initState();
    state.init();
  }

  @override
  Widget build(BuildContext context) {
    // Rebuilds the whole app when the language changes, so direction and text both flip.
    return ListenableBuilder(
      listenable: state,
      builder: (context, _) => MaterialApp(
        title: 'Nabd Cashier',
        debugShowCheckedModeBanner: false,
        theme: ThemeData(
          useMaterial3: true,
          colorScheme: ColorScheme.fromSeed(seedColor: cedar, primary: cedar, secondary: saffron),
          scaffoldBackgroundColor: mist,
        ),
        builder: (context, child) => Directionality(
          textDirection: isArabic ? TextDirection.rtl : TextDirection.ltr,
          child: child ?? const SizedBox.shrink(),
        ),
        home: Builder(builder: (context) {
          if (!state.ready) return const Scaffold(body: Center(child: CircularProgressIndicator()));
          if (!state.configured) return SetupScreen(state: state);
          if (!state.signedIn) return PinScreen(state: state);
          return SellScreen(state: state);
        }),
      ),
    );
  }
}

ButtonStyle saffronButton() => FilledButton.styleFrom(
      backgroundColor: saffron,
      foregroundColor: ink,
      minimumSize: const Size.fromHeight(60),
      textStyle: const TextStyle(fontSize: 20, fontWeight: FontWeight.w700),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
    );

Widget langButton(AppState s) =>
    TextButton(onPressed: () => s.setLang(isArabic ? 'en' : 'ar'), child: Text(t('lang.switch')));

// ---------------------------------------------------------------- setup
class SetupScreen extends StatefulWidget {
  const SetupScreen({super.key, required this.state});
  final AppState state;
  @override
  State<SetupScreen> createState() => _SetupScreenState();
}

class _SetupScreenState extends State<SetupScreen> {
  final url = TextEditingController(text: 'http://');
  final store = TextEditingController();
  final till = TextEditingController();

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Center(
        child: SingleChildScrollView(
          child: Container(
            width: 520,
            padding: const EdgeInsets.all(32),
            decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(24)),
            child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
              Row(children: [
                Expanded(child: Text(t('setup.title'), style: const TextStyle(fontSize: 28, fontWeight: FontWeight.w700))),
                langButton(widget.state),
              ]),
              const SizedBox(height: 8),
              Text(t('setup.help'), style: const TextStyle(color: slate, fontSize: 16)),
              const SizedBox(height: 20),
              TextField(controller: url, textDirection: TextDirection.ltr, decoration: InputDecoration(labelText: t('setup.server'), border: const OutlineInputBorder())),
              const SizedBox(height: 14),
              TextField(controller: store, textDirection: TextDirection.ltr, decoration: InputDecoration(labelText: t('setup.store'), border: const OutlineInputBorder())),
              const SizedBox(height: 14),
              TextField(controller: till, textDirection: TextDirection.ltr, decoration: InputDecoration(labelText: t('setup.till'), border: const OutlineInputBorder())),
              const SizedBox(height: 24),
              FilledButton(
                style: saffronButton(),
                onPressed: () {
                  if (url.text.trim().length < 8 || store.text.trim().length < 30 || till.text.trim().length < 30) {
                    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(t('setup.check'))));
                    return;
                  }
                  widget.state.saveSetup(url.text, store.text, till.text);
                },
                child: Text(t('setup.save')),
              ),
            ]),
          ),
        ),
      ),
    );
  }
}

// ---------------------------------------------------------------- PIN
class PinScreen extends StatefulWidget {
  const PinScreen({super.key, required this.state});
  final AppState state;
  @override
  State<PinScreen> createState() => _PinScreenState();
}

class _PinScreenState extends State<PinScreen> {
  String pin = '';
  String? error;
  bool busy = false;

  Future<void> submit() async {
    if (pin.length < 4) return;
    setState(() { busy = true; error = null; });
    try {
      await widget.state.signIn(pin);
    } on OfflineException {
      error = t('pin.offline');
    } on ApiException catch (e) {
      error = e.message;
    }
    if (mounted) setState(() { busy = false; pin = ''; });
  }

  void tap(String d) {
    if (pin.length >= 6 || busy) return;
    setState(() => pin += d);
  }

  @override
  Widget build(BuildContext context) {
    final waitingCount = widget.state.queue.length;
    Widget key(String label, VoidCallback onTap) => Padding(
          padding: const EdgeInsets.all(6),
          child: SizedBox(
            width: 84, height: 72,
            child: OutlinedButton(
              style: OutlinedButton.styleFrom(
                backgroundColor: Colors.white,
                foregroundColor: ink,
                textStyle: const TextStyle(fontSize: 26, fontWeight: FontWeight.w600),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
              ),
              onPressed: onTap,
              child: Text(label),
            ),
          ),
        );
    Widget? note;
    if (error != null) {
      note = Text(error!, style: const TextStyle(color: alertRed, fontSize: 16), textAlign: TextAlign.center);
    } else if (widget.state.syncMessage != null) {
      note = Text(widget.state.syncMessage!, style: const TextStyle(color: slate));
    } else if (waitingCount > 0) {
      note = Text(t('pin.waiting', {'n': '$waitingCount'}), style: const TextStyle(color: slate));
    }
    return Scaffold(
      body: Stack(children: [
        PositionedDirectional(top: 12, end: 16, child: langButton(widget.state)),
        Center(
          child: SingleChildScrollView(
            child: Column(mainAxisSize: MainAxisSize.min, children: [
              Container(
                width: 56, height: 56, alignment: Alignment.center,
                decoration: BoxDecoration(color: saffron, borderRadius: BorderRadius.circular(16)),
                child: const Text('N', style: TextStyle(fontSize: 28, fontWeight: FontWeight.w800, color: ink)),
              ),
              const SizedBox(height: 12),
              Text(t('pin.title'), style: const TextStyle(fontSize: 26, fontWeight: FontWeight.w700)),
              const SizedBox(height: 12),
              Text(pin.isEmpty ? '      ' : List.filled(pin.length, '●').join(' '),
                  style: const TextStyle(fontSize: 28, letterSpacing: 4, color: cedar)),
              SizedBox(height: 44, child: note),
              for (final row in [['1', '2', '3'], ['4', '5', '6'], ['7', '8', '9']])
                Directionality(
                  textDirection: TextDirection.ltr,
                  child: Row(mainAxisSize: MainAxisSize.min, children: [for (final d in row) key(d, () => tap(d))]),
                ),
              Directionality(
                textDirection: TextDirection.ltr,
                child: Row(mainAxisSize: MainAxisSize.min, children: [
                  key('⌫', () { if (pin.isNotEmpty) setState(() => pin = pin.substring(0, pin.length - 1)); }),
                  key('0', () => tap('0')),
                  key('OK', submit),
                ]),
              ),
              TextButton(
                onPressed: () => widget.state.resetSetup(),
                child: Text(t('pin.change'), style: const TextStyle(color: slate)),
              ),
            ]),
          ),
        ),
      ]),
    );
  }
}

// ---------------------------------------------------------------- sell
class SellScreen extends StatefulWidget {
  const SellScreen({super.key, required this.state});
  final AppState state;
  @override
  State<SellScreen> createState() => _SellScreenState();
}

class _SellScreenState extends State<SellScreen> {
  String search = '';
  String? category;
  final searchCtl = TextEditingController();
  final searchFocus = FocusNode();

  AppState get s => widget.state;

  /// A USB barcode scanner types the code and presses Enter. An exact barcode match goes straight to the cart.
  void _onSubmit(String value) {
    final code = value.trim();
    if (code.isEmpty) return;
    final hit = s.products.where((p) => p.barcode == code).toList();
    if (hit.length == 1) {
      s.add(hit.first);
      searchCtl.clear();
      setState(() => search = '');
    }
    searchFocus.requestFocus();
  }

  @override
  Widget build(BuildContext context) {
    final cats = s.products.map((p) => p.category).toSet().toList()..sort();
    final shown = s.products.where((p) {
      if (category != null && p.category != category) return false;
      if (search.isEmpty) return true;
      final q = search.toLowerCase();
      return p.name.toLowerCase().contains(q) || (p.barcode ?? '').contains(q);
    }).toList();

    return Scaffold(
      body: Column(children: [
        _header(),
        Expanded(
          child: Row(children: [
            Expanded(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  TextField(
                    controller: searchCtl,
                    focusNode: searchFocus,
                    autofocus: true,
                    onChanged: (v) => setState(() => search = v.trim()),
                    onSubmitted: _onSubmit,
                    decoration: InputDecoration(
                      hintText: t('sell.search'),
                      prefixIcon: const Icon(Icons.search),
                      filled: true, fillColor: Colors.white,
                      border: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: const BorderSide(color: line)),
                    ),
                  ),
                  const SizedBox(height: 12),
                  SizedBox(
                    height: 48,
                    child: ListView(scrollDirection: Axis.horizontal, children: [
                      _chip(t('sell.all'), category == null, () => setState(() => category = null)),
                      for (final c in cats) _chip(c, category == c, () => setState(() => category = c)),
                    ]),
                  ),
                  const SizedBox(height: 12),
                  Expanded(
                    child: shown.isEmpty
                        ? Center(child: Text(s.products.isEmpty ? t('sell.empty') : t('sell.nomatch'),
                            style: const TextStyle(color: slate, fontSize: 18)))
                        : GridView.builder(
                            gridDelegate: const SliverGridDelegateWithMaxCrossAxisExtent(
                                maxCrossAxisExtent: 190, mainAxisExtent: 112, crossAxisSpacing: 12, mainAxisSpacing: 12),
                            itemCount: shown.length,
                            itemBuilder: (_, i) => _tile(shown[i]),
                          ),
                  ),
                ]),
              ),
            ),
            _cartPanel(),
          ]),
        ),
      ]),
    );
  }

  Widget _chip(String label, bool on, VoidCallback onTap) => Padding(
        padding: const EdgeInsetsDirectional.only(end: 8),
        child: ChoiceChip(
          label: Text(label, style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600, color: on ? Colors.white : ink)),
          selected: on, onSelected: (_) => onTap(),
          selectedColor: cedar, backgroundColor: Colors.white, showCheckmark: false,
          side: const BorderSide(color: line),
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
        ),
      );

  Widget _tile(Product p) {
    final inCart = s.cart.where((l) => l.product.id == p.id).fold<int>(0, (a, l) => a + l.qty);
    return InkWell(
      borderRadius: BorderRadius.circular(16),
      onTap: () { s.add(p); searchFocus.requestFocus(); },
      child: Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: Colors.white, borderRadius: BorderRadius.circular(16),
          border: Border.all(color: inCart > 0 ? cedar : line, width: inCart > 0 ? 2 : 1),
        ),
        child: Stack(children: [
          Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
            CircleAvatar(radius: 16, backgroundColor: const Color(0xFFDDF1E8),
                child: Text(p.name.substring(0, 1).toUpperCase(), style: const TextStyle(color: cedarDeep, fontWeight: FontWeight.w700))),
            Text(p.name, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600)),
            Text(usd(p.priceCents), style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w700, color: cedar)),
          ]),
          if (inCart > 0)
            PositionedDirectional(
              end: 0, top: 0,
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                decoration: BoxDecoration(color: cedar, borderRadius: BorderRadius.circular(13)),
                child: Text('$inCart', style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w700)),
              ),
            ),
        ]),
      ),
    );
  }

  Widget _header() {
    final n = s.queue.length;
    final isOnline = s.online;
    final text = isOnline && n == 0
        ? t('status.synced')
        : (isOnline ? t('status.online_waiting', {'n': '$n'}) : t('status.offline_waiting', {'n': '$n'}));
    return Container(
      height: 64, padding: const EdgeInsets.symmetric(horizontal: 20),
      decoration: const BoxDecoration(color: Colors.white, border: Border(bottom: BorderSide(color: line))),
      child: Row(children: [
        Container(
          width: 36, height: 36, alignment: Alignment.center,
          decoration: BoxDecoration(color: saffron, borderRadius: BorderRadius.circular(10)),
          child: const Text('N', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 18)),
        ),
        const SizedBox(width: 12),
        Text(t('sell.title'), style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w700)),
        const SizedBox(width: 16),
        TextButton.icon(
          onPressed: () => Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => ReturnsScreen(state: s))),
          icon: const Icon(Icons.undo), label: Text(t('nav.returns')),
        ),
        TextButton.icon(
          onPressed: () => Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => ShiftScreen(state: s))),
          icon: const Icon(Icons.access_time), label: Text(t('nav.shift')),
        ),
        const Spacer(),
        InkWell(
          onTap: () => s.sync(),
          borderRadius: BorderRadius.circular(22),
          child: Container(
            height: 40, padding: const EdgeInsets.symmetric(horizontal: 16),
            decoration: BoxDecoration(
              color: isOnline && n == 0 ? const Color(0xFFDDF1E8) : waiting,
              borderRadius: BorderRadius.circular(22),
            ),
            child: Row(children: [
              Icon(Icons.circle, size: 10, color: isOnline && n == 0 ? const Color(0xFF1B8A6B) : const Color(0xFFC98A00)),
              const SizedBox(width: 8),
              Text(text, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 15)),
            ]),
          ),
        ),
        const SizedBox(width: 8),
        langButton(s),
        const SizedBox(width: 8),
        Text(s.cashierName ?? '', style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 16)),
        const SizedBox(width: 8),
        TextButton(onPressed: s.signOut, child: Text(t('sell.signout'))),
      ]),
    );
  }

  Widget _cartPanel() {
    final tt = s.totals;
    return Container(
      width: 400,
      decoration: const BoxDecoration(color: Colors.white, border: BorderDirectional(start: BorderSide(color: line))),
      child: Column(children: [
        Padding(
          padding: const EdgeInsetsDirectional.fromSTEB(20, 16, 12, 8),
          child: Row(children: [
            Text(t('sell.current'), style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w700)),
            const Spacer(),
            if (s.cart.isNotEmpty) TextButton(onPressed: s.clearCart, child: Text(t('sell.clear'))),
          ]),
        ),
        Expanded(
          child: s.cart.isEmpty
              ? Center(child: Text(t('sell.tap'), style: const TextStyle(color: slate, fontSize: 17)))
              : ListView(children: [
                  for (final l in s.cart)
                    ListTile(
                      title: Text(l.product.name, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 17)),
                      subtitle: Text(t('sell.each', {'price': usd(l.product.priceCents)})),
                      trailing: Row(mainAxisSize: MainAxisSize.min, children: [
                        IconButton(onPressed: () => s.changeQty(l, -1), icon: const Icon(Icons.remove_circle_outline)),
                        Text('${l.qty}', style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w700)),
                        IconButton(onPressed: () => s.changeQty(l, 1), icon: const Icon(Icons.add_circle_outline)),
                        SizedBox(width: 64, child: Text(usd(l.totalCents), textAlign: TextAlign.end, style: const TextStyle(fontWeight: FontWeight.w600))),
                      ]),
                    ),
                ]),
        ),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 8),
          child: Row(children: [
            Text(t('sell.discount'), style: const TextStyle(color: slate)),
            const SizedBox(width: 12),
            for (final p in [0, 5, if (s.canDiscount10) 10])
              Padding(
                padding: const EdgeInsetsDirectional.only(end: 8),
                child: ChoiceChip(
                  label: Text(p == 0 ? t('sell.none') : '$p%'),
                  selected: s.discountPercent == p, onSelected: (_) => s.setDiscount(p),
                ),
              ),
          ]),
        ),
        Container(
          margin: const EdgeInsets.fromLTRB(16, 4, 16, 12), padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(color: cedarDeep, borderRadius: BorderRadius.circular(16)),
          child: Column(children: [
            _row(t('sell.subtotal'), usd(tt.subtotal)),
            if (tt.discount > 0) _row(t('sell.discount'), '-${usd(tt.discount)}'),
            _row(t('sell.vat'), usd(tt.vat)),
            const SizedBox(height: 6),
            Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, crossAxisAlignment: CrossAxisAlignment.end, children: [
              Text(t('sell.total'), style: const TextStyle(color: Colors.white, fontSize: 18)),
              Text(usd(tt.total), style: const TextStyle(color: Colors.white, fontSize: 40, fontWeight: FontWeight.w800)),
            ]),
            Align(alignment: AlignmentDirectional.centerEnd,
                child: Text(lbp(tt.total, s.lbpRate), style: const TextStyle(color: Color(0xFFFFE08A), fontSize: 18, fontWeight: FontWeight.w600))),
          ]),
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
          child: FilledButton(
            style: saffronButton(),
            onPressed: s.cart.isEmpty ? null : _pay,
            child: Text(t('sell.pay')),
          ),
        ),
      ]),
    );
  }

  Widget _row(String a, String b) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 2),
        child: Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
          Text(a, style: const TextStyle(color: Color(0xFFCFE5DC), fontSize: 16)),
          Text(b, style: const TextStyle(color: Colors.white, fontSize: 16)),
        ]),
      );

  Future<void> _pay() async {
    final tt = s.totals;
    final tender = await showDialog<String>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(t('pay.title', {'amount': usd(tt.total)})),
        content: Column(mainAxisSize: MainAxisSize.min, children: [
          Text(lbp(tt.total, s.lbpRate), style: const TextStyle(fontSize: 18, color: slate)),
          const SizedBox(height: 20),
          for (final o in [['usd', t('pay.usd')], ['lbp', t('pay.lbp')], ['card', t('pay.card')]])
            Padding(
              padding: const EdgeInsets.only(bottom: 10),
              child: SizedBox(
                width: 320, height: 60,
                child: OutlinedButton(
                  style: OutlinedButton.styleFrom(textStyle: const TextStyle(fontSize: 19, fontWeight: FontWeight.w600)),
                  onPressed: () => Navigator.pop(ctx, o[0]),
                  child: Text(o[1]),
                ),
              ),
            ),
        ]),
        actions: [TextButton(onPressed: () => Navigator.pop(ctx), child: Text(t('common.cancel')))],
      ),
    );
    if (tender == null || !mounted) return;
    final sale = await s.completeSale(tender);
    if (!mounted) return;
    await showDialog<void>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(t('done.title')),
        content: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(t('done.receipt', {'no': '${sale['receiptNo']}'}), style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w600)),
          const SizedBox(height: 8),
          Text('${usd(sale['_total'] as int)}  (${lbp(sale['_total'] as int, s.lbpRate)})'),
          const SizedBox(height: 8),
          Text(s.online ? t('done.uploading') : t('done.saved'), style: const TextStyle(color: slate)),
        ]),
        actions: [
          TextButton(
            onPressed: () async {
              try {
                await printReceipt(sale, s.lbpRate);
              } catch (_) {
                // No printer or the dialog was closed: the sale is already saved either way.
              }
            },
            child: Text(t('done.print')),
          ),
          FilledButton(onPressed: () => Navigator.pop(ctx), child: Text(t('done.new'))),
        ],
      ),
    );
    searchFocus.requestFocus();
  }
}

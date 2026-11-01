import 'package:flutter/material.dart';

import 'api.dart';
import 'app_state.dart';
import 'main.dart' show cedar, saffronButton, slate, line, alertRed, waiting, surface, okBg;
import 'models.dart';
import 'strings.dart';

String _err(Object e) {
  if (e is OfflineException) return t('ret.offline');
  if (e is ApiException) return e.message;
  return t('err.generic');
}

Widget _card(Widget child) => Container(
      constraints: const BoxConstraints(maxWidth: 640),
      padding: const EdgeInsets.all(24),
      decoration: BoxDecoration(color: surface, borderRadius: BorderRadius.circular(20), border: Border.all(color: line)),
      child: child,
    );

// ---------------------------------------------------------------- returns
class ReturnsScreen extends StatefulWidget {
  const ReturnsScreen({super.key, required this.state});
  final AppState state;
  @override
  State<ReturnsScreen> createState() => _ReturnsScreenState();
}

class _ReturnsScreenState extends State<ReturnsScreen> {
  final receipt = TextEditingController();
  final reason = TextEditingController();
  final pin = TextEditingController();
  Map? sale;
  final Map<String, int> qty = {};
  String tender = 'usd';
  bool busy = false;
  String? error;
  String? done;

  AppState get s => widget.state;
  bool get needsPin => s.roleId == 'cashier';

  Future<void> find() async {
    setState(() { busy = true; error = null; done = null; sale = null; qty.clear(); });
    try {
      final r = await s.lookupSale(receipt.text);
      sale = r;
      tender = (r['tender'] as String?) ?? 'usd';
    } catch (e) {
      error = _err(e);
    }
    if (mounted) setState(() => busy = false);
  }

  Future<void> submit() async {
    final lines = [for (final e in qty.entries) if (e.value > 0) {'productId': e.key, 'qty': e.value}];
    if (lines.isEmpty) { setState(() => error = t('ret.pick')); return; }
    setState(() { busy = true; error = null; });
    try {
      final refund = await s.submitReturn(
        saleId: sale!['id'] as String, tender: tender, lines: lines, reason: reason.text, approverPin: pin.text);
      done = t('ret.done', {'amount': usd(refund)});
      sale = null; qty.clear(); receipt.clear(); reason.clear(); pin.clear();
    } catch (e) {
      error = _err(e);
    }
    if (mounted) setState(() => busy = false);
  }

  @override
  Widget build(BuildContext context) {
    final lines = ((sale?['lines'] as List?) ?? []).cast<Map>();
    return Scaffold(
      appBar: AppBar(title: Text(t('ret.title')), backgroundColor: surface),
      body: Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(16),
          child: _card(Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(t('ret.help'), style: TextStyle(color: slate, fontSize: 16)),
            const SizedBox(height: 14),
            Row(children: [
              Expanded(child: TextField(controller: receipt, onSubmitted: (_) => find(),
                  decoration: InputDecoration(labelText: t('ret.receipt'), border: const OutlineInputBorder()))),
              const SizedBox(width: 12),
              FilledButton(onPressed: busy ? null : find, child: Text(t('ret.find'))),
            ]),
            if (error != null) Padding(padding: const EdgeInsets.only(top: 12), child: Text(error!, style: const TextStyle(color: alertRed, fontSize: 16))),
            if (done != null) Padding(padding: const EdgeInsets.only(top: 12), child: Text(done!, style: const TextStyle(color: cedar, fontSize: 17, fontWeight: FontWeight.w600))),
            if (sale != null) ...[
              const SizedBox(height: 16),
              for (final l in lines)
                ListTile(
                  contentPadding: EdgeInsets.zero,
                  title: Text(l['name'] as String, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 17)),
                  subtitle: Text(t('ret.sold', {'sold': '${l['sold']}', 'returned': '${l['returned']}'})),
                  trailing: Row(mainAxisSize: MainAxisSize.min, children: [
                    IconButton(
                      onPressed: (qty[l['productId']] ?? 0) > 0 ? () => setState(() => qty[l['productId'] as String] = (qty[l['productId']] ?? 0) - 1) : null,
                      icon: const Icon(Icons.remove_circle_outline)),
                    Text('${qty[l['productId']] ?? 0}', style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w700)),
                    IconButton(
                      onPressed: (qty[l['productId']] ?? 0) < (l['returnable'] as int) ? () => setState(() => qty[l['productId'] as String] = (qty[l['productId']] ?? 0) + 1) : null,
                      icon: const Icon(Icons.add_circle_outline)),
                  ]),
                ),
              const Divider(),
              Text(t('ret.refund_method'), style: TextStyle(color: slate)),
              const SizedBox(height: 6),
              Wrap(spacing: 8, children: [
                for (final o in [['usd', t('pay.usd')], ['lbp', t('pay.lbp')], ['card', t('pay.card')]])
                  ChoiceChip(label: Text(o[1]), selected: tender == o[0], onSelected: (_) => setState(() => tender = o[0])),
              ]),
              const SizedBox(height: 12),
              TextField(controller: reason, decoration: InputDecoration(labelText: t('ret.reason'), border: const OutlineInputBorder())),
              if (needsPin) ...[
                const SizedBox(height: 12),
                TextField(
                  controller: pin, obscureText: true, keyboardType: TextInputType.number, maxLength: 6,
                  decoration: InputDecoration(labelText: t('ret.pin'), helperText: t('ret.pin_hint'), border: const OutlineInputBorder()),
                ),
              ],
              const SizedBox(height: 12),
              FilledButton(style: saffronButton(), onPressed: busy ? null : submit, child: Text(t('ret.submit'))),
            ],
          ])),
        ),
      ),
    );
  }
}

// ---------------------------------------------------------------- shift
class ShiftScreen extends StatefulWidget {
  const ShiftScreen({super.key, required this.state});
  final AppState state;
  @override
  State<ShiftScreen> createState() => _ShiftScreenState();
}

class _ShiftScreenState extends State<ShiftScreen> {
  final floatCtl = TextEditingController(text: '0');
  final usdCtl = TextEditingController();
  final lbpCtl = TextEditingController();
  final cardCtl = TextEditingController();
  final noteCtl = TextEditingController();
  bool loading = true;
  bool busy = false;
  String? error;
  String? done;

  AppState get s => widget.state;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      await s.loadShift();
    } catch (e) {
      error = _err(e);
    }
    if (mounted) setState(() => loading = false);
  }

  Future<void> open() async {
    final cents = parseCents(floatCtl.text);
    if (cents == null) return;
    setState(() { busy = true; error = null; });
    try {
      await s.openShift(cents);
      done = null;
    } catch (e) {
      error = _err(e);
    }
    if (mounted) setState(() => busy = false);
  }

  Future<void> close() async {
    if (s.queue.isNotEmpty) { setState(() => error = t('shift.queue', {'n': '${s.queue.length}'})); return; }
    final u = parseCents(usdCtl.text);
    final l = parseWhole(lbpCtl.text);
    final c = parseCents(cardCtl.text);
    if (u == null || l == null || c == null) { setState(() => error = t('setup.check')); return; }
    setState(() { busy = true; error = null; });
    try {
      await s.closeShift(u, l, c, noteCtl.text);
      done = t('shift.closed');
      usdCtl.clear(); lbpCtl.clear(); cardCtl.clear(); noteCtl.clear();
    } catch (e) {
      error = _err(e);
    }
    if (mounted) setState(() => busy = false);
  }

  Widget _compare(String label, String expected, String? counted, int? diff, String diffText) {
    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(border: Border.all(color: line), borderRadius: BorderRadius.circular(14)),
      child: Row(children: [
        Expanded(child: Text(label, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 16))),
        Text('${t('shift.expected')}: $expected', style: TextStyle(color: slate)),
        if (counted != null) ...[
          const SizedBox(width: 12),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
            decoration: BoxDecoration(color: diff == 0 ? okBg : waiting, borderRadius: BorderRadius.circular(12)),
            child: Text(diffText, style: const TextStyle(fontWeight: FontWeight.w600)),
          ),
        ],
      ]),
    );
  }

  @override
  Widget build(BuildContext context) {
    final sh = s.shift;
    final exp = (sh?['expected'] as Map?) ?? {};
    final expUsd = (exp['usdCents'] as num?)?.toInt() ?? 0;
    final expLbp = (exp['lbp'] as num?)?.toInt() ?? 0;
    final expCard = (exp['cardCents'] as num?)?.toInt() ?? 0;
    final cu = parseCents(usdCtl.text);
    final cl = parseWhole(lbpCtl.text);
    final cc = parseCents(cardCtl.text);
    String money(int d) => d == 0 ? t('shift.matches') : (d < 0 ? t('shift.short', {'amount': usd(-d)}) : t('shift.over', {'amount': usd(d)}));
    String lbpText(int d) => d == 0 ? t('shift.matches') : (d < 0 ? t('shift.short', {'amount': '${-d} LBP'}) : t('shift.over', {'amount': '$d LBP'}));
    final differs = (cu != null && cu != expUsd) || (cl != null && cl != expLbp) || (cc != null && cc != expCard);

    return Scaffold(
      appBar: AppBar(title: Text(t('shift.title')), backgroundColor: surface),
      body: Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(16),
          child: _card(loading
              ? const Center(child: CircularProgressIndicator())
              : Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
                  if (error != null) Padding(padding: const EdgeInsets.only(bottom: 12), child: Text(error!, style: const TextStyle(color: alertRed, fontSize: 16))),
                  if (done != null) Padding(padding: const EdgeInsets.only(bottom: 12), child: Text(done!, style: const TextStyle(color: cedar, fontSize: 17, fontWeight: FontWeight.w600))),
                  if (sh == null) ...[
                    Text(t('shift.none'), style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w600)),
                    const SizedBox(height: 14),
                    TextField(controller: floatCtl, keyboardType: TextInputType.number,
                        decoration: InputDecoration(labelText: t('shift.float'), border: const OutlineInputBorder())),
                    const SizedBox(height: 14),
                    FilledButton(style: saffronButton(), onPressed: busy ? null : open, child: Text(t('shift.open'))),
                  ] else ...[
                    Text(t('shift.since', {'time': '${sh['openedAt']}'.replaceFirst('T', ' ').split('.').first}), style: TextStyle(color: slate)),
                    const SizedBox(height: 6),
                    Text(t('shift.help'), style: const TextStyle(fontSize: 16)),
                    const SizedBox(height: 14),
                    TextField(controller: usdCtl, onChanged: (_) => setState(() {}), keyboardType: TextInputType.number,
                        decoration: InputDecoration(labelText: t('shift.usd'), border: const OutlineInputBorder())),
                    const SizedBox(height: 10),
                    TextField(controller: lbpCtl, onChanged: (_) => setState(() {}), keyboardType: TextInputType.number,
                        decoration: InputDecoration(labelText: t('shift.lbp'), border: const OutlineInputBorder())),
                    const SizedBox(height: 10),
                    TextField(controller: cardCtl, onChanged: (_) => setState(() {}), keyboardType: TextInputType.number,
                        decoration: InputDecoration(labelText: t('shift.card'), border: const OutlineInputBorder())),
                    const SizedBox(height: 14),
                    _compare(t('shift.usd'), usd(expUsd), cu == null ? null : usd(cu), cu == null ? null : cu - expUsd, cu == null ? '' : money(cu - expUsd)),
                    _compare(t('shift.lbp'), '$expLbp LBP', cl == null ? null : '$cl', cl == null ? null : cl - expLbp, cl == null ? '' : lbpText(cl - expLbp)),
                    _compare(t('shift.card'), usd(expCard), cc == null ? null : usd(cc), cc == null ? null : cc - expCard, cc == null ? '' : money(cc - expCard)),
                    if (differs) ...[
                      const SizedBox(height: 4),
                      TextField(controller: noteCtl, decoration: InputDecoration(labelText: t('shift.note'), border: const OutlineInputBorder())),
                    ],
                    const SizedBox(height: 14),
                    FilledButton(style: saffronButton(), onPressed: busy ? null : close, child: Text(t('shift.close'))),
                  ],
                ])),
        ),
      ),
    );
  }
}

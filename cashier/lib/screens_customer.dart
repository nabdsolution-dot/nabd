import 'package:flutter/material.dart';

import 'api.dart';
import 'app_state.dart';
import 'main.dart' show saffronButton, slate;
import 'models.dart';
import 'strings.dart';

String _err(Object e) {
  if (e is OfflineException) return t('cust.offline');
  if (e is ApiException) return e.message;
  return t('err.generic');
}

/// Pick, create or pay down a customer. Needs the server.
Future<void> showCustomerSheet(BuildContext context, AppState s) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    showDragHandle: true,
    builder: (_) => Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.of(context).viewInsets.bottom),
      child: _CustomerSheet(s: s),
    ),
  );
}

class _CustomerSheet extends StatefulWidget {
  const _CustomerSheet({required this.s});
  final AppState s;
  @override
  State<_CustomerSheet> createState() => _CustomerSheetState();
}

class _CustomerSheetState extends State<_CustomerSheet> {
  final q = TextEditingController();
  final name = TextEditingController();
  final phone = TextEditingController();
  final pay = TextEditingController();
  List<Customer> list = [];
  String err = '';

  AppState get s => widget.s;

  @override
  void initState() {
    super.initState();
    find();
  }

  Future<void> find() async {
    try {
      final r = await s.searchCustomers(q.text);
      if (mounted) setState(() { list = r; err = ''; });
    } catch (e) {
      if (mounted) setState(() => err = _err(e));
    }
  }

  void pick(Customer c) {
    s.setCustomer(c);
    Navigator.pop(context);
  }

  Future<void> add() async {
    if (name.text.trim().isEmpty) return;
    try {
      pick(await s.createCustomer(name.text, phone.text));
    } catch (e) {
      setState(() => err = _err(e));
    }
  }

  Future<void> receive() async {
    final c = s.customer;
    final cents = parseCents(pay.text);
    if (c == null || cents == null || cents == 0) return;
    try {
      final u = await s.takePayment(c, cents);
      s.setCustomer(u);
      pay.clear();
      setState(() => err = '');
    } catch (e) {
      setState(() => err = _err(e));
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = s.customer;
    return SafeArea(
      child: ConstrainedBox(
        constraints: BoxConstraints(maxHeight: MediaQuery.of(context).size.height * 0.85),
        child: ListView(padding: const EdgeInsets.fromLTRB(20, 0, 20, 20), shrinkWrap: true, children: [
          Text(t('cust.title'), style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w700)),
          if (err.isNotEmpty) Padding(padding: const EdgeInsets.only(top: 8), child: Text(err, style: const TextStyle(color: Colors.red))),
          if (c != null) ...[
            const SizedBox(height: 8),
            Card(
              child: Padding(
                padding: const EdgeInsets.all(12),
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(c.name, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 17)),
                  Text('${t('cust.points')}: ${c.points} · ${t('cust.balance')}: ${usd(c.balanceCents)}'),
                  Row(children: [
                    Expanded(child: TextField(controller: pay, keyboardType: const TextInputType.numberWithOptions(decimal: true), decoration: InputDecoration(labelText: t('cust.payment')))),
                    TextButton(onPressed: receive, child: Text(t('cust.receive'))),
                    TextButton(onPressed: () { s.setCustomer(null); Navigator.pop(context); }, child: Text(t('cust.remove'))),
                  ]),
                ]),
              ),
            ),
          ],
          const SizedBox(height: 8),
          Row(children: [
            Expanded(child: TextField(controller: q, decoration: InputDecoration(labelText: t('cust.search')), onSubmitted: (_) => find())),
            IconButton(onPressed: find, icon: const Icon(Icons.search)),
          ]),
          for (final x in list)
            ListTile(
              title: Text(x.name),
              subtitle: Text('${x.phone ?? ''}  ·  ${x.points} ${t('cust.pts')}'),
              onTap: () => pick(x),
            ),
          const Divider(),
          Text(t('cust.new'), style: TextStyle(color: slate)),
          Row(children: [
            Expanded(child: TextField(controller: name, decoration: InputDecoration(labelText: t('cust.name')))),
            const SizedBox(width: 8),
            Expanded(child: TextField(controller: phone, keyboardType: TextInputType.phone, decoration: InputDecoration(labelText: t('cust.phone')))),
          ]),
          const SizedBox(height: 8),
          FilledButton(style: saffronButton(), onPressed: add, child: Text(t('cust.add'))),
        ]),
      ),
    );
  }
}

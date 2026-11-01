import 'package:flutter/material.dart';

import 'api.dart';
import 'app_state.dart';
import 'main.dart' show DisplaySheet, line, slate, surface, cedar, alertRed, okBg;
import 'strings.dart';

/// The person's name, role and menu, shown in the top bar.
class UserMenu extends StatelessWidget {
  const UserMenu({super.key, required this.state, this.compact = false});
  final AppState state;
  final bool compact;

  PopupMenuItem<String> _item(String v, IconData icon, String label) => PopupMenuItem<String>(
        value: v,
        child: Row(children: [Icon(icon, size: 20), const SizedBox(width: 12), Text(label)]),
      );

  @override
  Widget build(BuildContext context) {
    final name = state.cashierName ?? '';
    final initial = name.isEmpty ? '?' : name.substring(0, 1).toUpperCase();
    return PopupMenuButton<String>(
      tooltip: name,
      offset: const Offset(0, 48),
      onSelected: (v) {
        switch (v) {
          case 'profile':
            Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => ProfileScreen(state: state)));
          case 'about':
            Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => AboutScreen(state: state)));
          case 'display':
            showModalBottomSheet<void>(context: context, isScrollControlled: true, builder: (_) => DisplaySheet(state: state));
          case 'lang':
            state.setLang(isArabic ? 'en' : 'ar');
          case 'out':
            state.signOut();
        }
      },
      itemBuilder: (_) => [
        PopupMenuItem<String>(
          enabled: false,
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(name, style: TextStyle(fontWeight: FontWeight.w700, fontSize: 16, color: Theme.of(context).colorScheme.onSurface)),
            Text(state.roleName, style: TextStyle(color: slate)),
          ]),
        ),
        const PopupMenuDivider(),
        _item('profile', Icons.person_outline, t('menu.profile')),
        _item('display', Icons.tune, t('menu.display')),
        _item('lang', Icons.translate, t('lang.switch')),
        _item('about', Icons.info_outline, t('menu.about')),
        const PopupMenuDivider(),
        _item('out', Icons.logout, t('sell.signout')),
      ],
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 6),
        child: Row(mainAxisSize: MainAxisSize.min, children: [
          CircleAvatar(radius: 18, backgroundColor: cedar, child: Text(initial, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w700))),
          if (!compact) ...[
            const SizedBox(width: 8),
            ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 120),
              child: Text(name, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 15)),
            ),
          ],
          const Icon(Icons.arrow_drop_down),
        ]),
      ),
    );
  }
}

Widget _row(String label, String value) => Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        SizedBox(width: 130, child: Text(label, style: TextStyle(color: slate))),
        Expanded(child: Text(value.isEmpty ? '-' : value, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 16))),
      ]),
    );

Widget _box(Widget child) => Container(
      constraints: const BoxConstraints(maxWidth: 560),
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(color: surface, borderRadius: BorderRadius.circular(20), border: Border.all(color: line)),
      child: child,
    );

// ---------------------------------------------------------------- profile
class ProfileScreen extends StatefulWidget {
  const ProfileScreen({super.key, required this.state});
  final AppState state;
  @override
  State<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends State<ProfileScreen> {
  final cur = TextEditingController();
  final next = TextEditingController();
  String? msg;
  bool ok = false;
  bool busy = false;

  AppState get s => widget.state;

  Future<void> _save() async {
    if (!RegExp(r'^\d{4,6}$').hasMatch(next.text) || !RegExp(r'^\d{4,6}$').hasMatch(cur.text)) {
      setState(() { msg = t('prof.bad'); ok = false; });
      return;
    }
    setState(() { busy = true; msg = null; });
    try {
      await s.changePin(cur.text, next.text);
      cur.clear();
      next.clear();
      msg = t('prof.saved');
      ok = true;
    } on OfflineException {
      msg = t('pin.offline');
      ok = false;
    } on ApiException catch (e) {
      msg = e.message;
      ok = false;
    }
    if (mounted) setState(() => busy = false);
  }

  @override
  Widget build(BuildContext context) {
    final perms = s.permissions.toList()..sort();
    return Scaffold(
      appBar: AppBar(title: Text(t('prof.title')), backgroundColor: surface),
      body: Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(16),
          child: Column(children: [
            _box(Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Row(children: [
                CircleAvatar(radius: 30, backgroundColor: cedar,
                    child: Text((s.cashierName ?? '?').substring(0, 1).toUpperCase(), style: const TextStyle(color: Colors.white, fontSize: 26, fontWeight: FontWeight.w700))),
                const SizedBox(width: 16),
                Expanded(child: Text(s.cashierName ?? '', style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w700))),
              ]),
              const SizedBox(height: 12),
              _row(t('prof.role'), s.roleName),
              _row(t('prof.store'), s.storeName),
              _row(t('prof.till'), s.tillId.length > 8 ? s.tillId.substring(0, 8) : s.tillId),
              _row(t('prof.email'), s.email),
              const SizedBox(height: 8),
              Text(t('prof.can'), style: TextStyle(color: slate)),
              const SizedBox(height: 8),
              Wrap(spacing: 8, runSpacing: 8, children: [
                for (final p in perms) Chip(label: Text(p.replaceAll('_', ' ')), backgroundColor: okBg, side: BorderSide.none),
              ]),
            ])),
            const SizedBox(height: 16),
            _box(Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(t('prof.pin'), style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w700)),
              const SizedBox(height: 12),
              if (msg != null)
                Padding(
                  padding: const EdgeInsets.only(bottom: 12),
                  child: Text(msg!, style: TextStyle(color: ok ? cedar : alertRed, fontWeight: FontWeight.w600)),
                ),
              TextField(controller: cur, obscureText: true, keyboardType: TextInputType.number, maxLength: 6,
                  decoration: InputDecoration(labelText: t('prof.cur'), border: const OutlineInputBorder(), counterText: '')),
              const SizedBox(height: 12),
              TextField(controller: next, obscureText: true, keyboardType: TextInputType.number, maxLength: 6,
                  decoration: InputDecoration(labelText: t('prof.new'), border: const OutlineInputBorder(), counterText: '')),
              const SizedBox(height: 16),
              SizedBox(width: double.infinity, child: FilledButton(onPressed: busy ? null : _save, child: Text(t('prof.save')))),
            ])),
          ]),
        ),
      ),
    );
  }
}

// ---------------------------------------------------------------- about
class AboutScreen extends StatefulWidget {
  const AboutScreen({super.key, required this.state});
  final AppState state;
  @override
  State<AboutScreen> createState() => _AboutScreenState();
}

class _AboutScreenState extends State<AboutScreen> {
  String? msg;
  bool busy = false;
  AppState get s => widget.state;

  Future<void> _check() async {
    setState(() { busy = true; msg = null; });
    await s.checkUpdate(force: true);
    if (!mounted) return;
    setState(() {
      busy = false;
      msg = s.updateVersion == null ? (s.online ? t('about.latest') : t('about.offline')) : t('upd.msg', {'v': s.updateVersion!});
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: Text(t('about.title')), backgroundColor: surface),
      body: Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(16),
          child: _box(Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Row(children: [
              Container(
                width: 64, height: 64, alignment: Alignment.center,
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(18),
                  gradient: const LinearGradient(colors: [Color(0xFF168468), Color(0xFF06342A)], begin: Alignment.topCenter, end: Alignment.bottomCenter),
                ),
                child: const Text('N', style: TextStyle(color: Color(0xFFF7B500), fontSize: 38, fontWeight: FontWeight.w900)),
              ),
              const SizedBox(width: 16),
              Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                const Text('Nabd', style: TextStyle(fontSize: 26, fontWeight: FontWeight.w800)),
                Text(t('about.tag'), style: TextStyle(color: slate)),
              ])),
            ]),
            const SizedBox(height: 16),
            _row(t('about.version'), appVersion),
            _row(t('about.server'), s.serverUrl),
            _row(t('prof.store'), s.storeName.isEmpty ? s.storeId : s.storeName),
            const SizedBox(height: 12),
            if (msg != null) Padding(padding: const EdgeInsets.only(bottom: 12), child: Text(msg!, style: const TextStyle(fontWeight: FontWeight.w600))),
            SizedBox(width: double.infinity, child: OutlinedButton.icon(onPressed: busy ? null : _check, icon: const Icon(Icons.system_update), label: Text(t('about.check')))),
            const SizedBox(height: 16),
            Text('© Nabd. ${t('about.rights')}', style: TextStyle(color: slate, fontSize: 13)),
          ])),
        ),
      ),
    );
  }
}

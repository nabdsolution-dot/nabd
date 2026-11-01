import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:url_launcher/url_launcher.dart';

import 'api.dart';
import 'app_state.dart';
import 'models.dart';
import 'receipt.dart';
import 'screens_extra.dart';
import 'screens_profile.dart';
import 'strings.dart';

// The accent colors follow the chosen color scheme (see applyPalette).
Color cedar = const Color(0xFF0E5A48);
Color cedarDeep = const Color(0xFF0B4A3B);
Color saffron = const Color(0xFFF0A500);
Color cedarLight = const Color(0xFF3FB992); // main color on dark backgrounds

/// main, deep, button/accent, light (for dark mode)
const accents = <String, List<Color>>{
  'green': [Color(0xFF0E5A48), Color(0xFF0B4A3B), Color(0xFFF0A500), Color(0xFF3FB992)],
  'blue': [Color(0xFF1D5FD1), Color(0xFF174BA8), Color(0xFFFF8A00), Color(0xFF6FA2FF)],
  'red': [Color(0xFFC62839), Color(0xFFA01F2E), Color(0xFFFFB400), Color(0xFFFF7A86)],
  'purple': [Color(0xFF6B3FC2), Color(0xFF55309C), Color(0xFFF2B705), Color(0xFFB697FF)],
};
const onSaffron = Color(0xFF12201C); // dark text that sits on the saffron buttons in both themes
const alertRed = Color(0xFFB3261E);

// These follow the theme. The app rebuilds from the top when the theme changes, so plain variables are enough.
Color ink = const Color(0xFF12201C);
Color mist = const Color(0xFFF2F4F1);
Color slate = const Color(0xFF55655F);
Color line = const Color(0xFFD5DCD9);
Color waiting = const Color(0xFFFFF1CC);
Color surface = Colors.white;
Color okBg = const Color(0xFFDDF1E8);

void applyPalette(bool dark, String accent) {
  final a = accents[accent] ?? accents['green']!;
  cedar = a[0];
  cedarDeep = a[1];
  saffron = a[2];
  cedarLight = a[3];
  if (dark) {
    ink = const Color(0xFFE8EEEB);
    mist = const Color(0xFF0F1B18);
    slate = const Color(0xFFA3B3AD);
    line = const Color(0xFF2F433D);
    waiting = const Color(0xFF4A3A10);
    surface = const Color(0xFF182824);
    okBg = const Color(0xFF14392D);
  } else {
    ink = const Color(0xFF12201C);
    mist = const Color(0xFFF2F4F1);
    slate = const Color(0xFF55655F);
    line = const Color(0xFFD5DCD9);
    waiting = const Color(0xFFFFF1CC);
    surface = Colors.white;
    okBg = const Color(0xFFDDF1E8);
  }
}

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  // Every orientation is allowed; the layouts adapt to the screen shape.
  SystemChrome.setPreferredOrientations(DeviceOrientation.values);
  runApp(const NabdCashierApp());
}

class NabdCashierApp extends StatefulWidget {
  const NabdCashierApp({super.key});
  @override
  State<NabdCashierApp> createState() => _NabdCashierAppState();
}

class _NabdCashierAppState extends State<NabdCashierApp> with WidgetsBindingObserver {
  final state = AppState();

  @override
  void didChangePlatformBrightness() => setState(() {});

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    state.init();
  }

  @override
  Widget build(BuildContext context) {
    // Rebuilds the whole app when language, theme or zoom changes, so direction, colors and size all follow.
    return ListenableBuilder(
      listenable: state,
      builder: (context, _) {
        final dark = state.themeMode == 'dark' ||
            (state.themeMode == 'system' && WidgetsBinding.instance.platformDispatcher.platformBrightness == Brightness.dark);
        applyPalette(dark, state.accent);
        final scheme = ColorScheme.fromSeed(
          seedColor: cedar, primary: dark ? cedarLight : cedar, secondary: saffron,
          brightness: dark ? Brightness.dark : Brightness.light,
        );
        return MaterialApp(
          key: ValueKey('$dark-$currentLang-${state.accent}'),
          title: 'Nabd Cashier',
          debugShowCheckedModeBanner: false,
          themeMode: dark ? ThemeMode.dark : ThemeMode.light,
          theme: ThemeData(useMaterial3: true, colorScheme: scheme, scaffoldBackgroundColor: mist),
          darkTheme: ThemeData(useMaterial3: true, colorScheme: scheme, scaffoldBackgroundColor: mist),
          builder: (context, child) {
            final mq = MediaQuery.of(context);
            final z = state.zoom;
            Widget body = child ?? const SizedBox.shrink();
            if (state.updateVersion != null && !state.updateDismissed) {
              // The banner takes the top inset, so the screen below must not add it again.
              body = Directionality(
                textDirection: isArabic ? TextDirection.rtl : TextDirection.ltr,
                child: Column(children: [
                  updateBanner(state),
                  Expanded(child: MediaQuery.removePadding(context: context, removeTop: true, child: body)),
                ]),
              );
            }
            if ((z - 1.0).abs() > 0.001) {
              // Real zoom: lay the app out on a smaller (or larger) virtual screen, then scale it to fit.
              final w = mq.size.width / z, h = mq.size.height / z;
              body = MediaQuery(
                data: mq.copyWith(size: Size(w, h), padding: mq.padding / z, viewPadding: mq.viewPadding / z, viewInsets: mq.viewInsets / z),
                child: ClipRect(
                  child: Transform.scale(
                    scale: z, alignment: Alignment.topLeft,
                    child: OverflowBox(minWidth: w, maxWidth: w, minHeight: h, maxHeight: h, alignment: Alignment.topLeft, child: body),
                  ),
                ),
              );
            }
            return Directionality(textDirection: isArabic ? TextDirection.rtl : TextDirection.ltr, child: body);
          },
          home: Builder(builder: (context) {
            if (!state.ready) return const Scaffold(body: Center(child: CircularProgressIndicator()));
            if (!state.configured) return SetupScreen(state: state);
            if (!state.signedIn) return PinScreen(state: state);
            return SellScreen(state: state);
          }),
        );
      },
    );
  }
}

bool dark(BuildContext c) => Theme.of(c).brightness == Brightness.dark;

ButtonStyle saffronButton() => FilledButton.styleFrom(
      backgroundColor: saffron,
      foregroundColor: onSaffron,
      minimumSize: const Size.fromHeight(60),
      textStyle: const TextStyle(fontSize: 20, fontWeight: FontWeight.w700),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
    );

/// Shown on every screen when the server knows a newer app version.
Widget updateBanner(AppState s) {
  if (s.updateVersion == null || s.updateDismissed) return const SizedBox.shrink();
  return Material(
    color: saffron,
    child: SafeArea(
      bottom: false,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
        child: Row(children: [
          const Icon(Icons.system_update, color: onSaffron),
          const SizedBox(width: 10),
          Expanded(child: Text(t('upd.msg', {'v': s.updateVersion!}), style: const TextStyle(color: onSaffron, fontWeight: FontWeight.w600))),
          if (s.updateUrl.isNotEmpty)
            TextButton(
              onPressed: () async {
                try {
                  await launchUrl(Uri.parse(s.updateUrl), mode: LaunchMode.externalApplication);
                } catch (_) {
                  // No browser to open the link; the banner stays so it can be tried again.
                }
              },
              child: Text(t('upd.get'), style: const TextStyle(color: onSaffron, fontWeight: FontWeight.w800)),
            ),
          TextButton(onPressed: s.dismissUpdate, child: Text(t('upd.later'), style: const TextStyle(color: onSaffron))),
        ]),
      ),
    ),
  );
}

Widget displayButton(BuildContext context, AppState s) => IconButton(
      tooltip: t('disp.title'),
      icon: const Icon(Icons.tune),
      onPressed: () => showModalBottomSheet<void>(
        context: context,
        isScrollControlled: true,
        builder: (_) => DisplaySheet(state: s),
      ),
    );

class DisplaySheet extends StatelessWidget {
  const DisplaySheet({super.key, required this.state});
  final AppState state;
  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: state,
      builder: (context, _) => SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(24, 20, 24, 24),
          child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(t('disp.title'), style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w700)),
            const SizedBox(height: 16),
            Text(t('disp.theme'), style: TextStyle(color: slate)),
            const SizedBox(height: 8),
            SizedBox(
              width: double.infinity,
              child: SegmentedButton<String>(
                showSelectedIcon: false,
                segments: [
                  ButtonSegment(value: 'system', icon: const Icon(Icons.brightness_auto), label: Text(t('disp.system'))),
                  ButtonSegment(value: 'light', icon: const Icon(Icons.light_mode), label: Text(t('disp.light'))),
                  ButtonSegment(value: 'dark', icon: const Icon(Icons.dark_mode), label: Text(t('disp.dark'))),
                ],
                selected: {state.themeMode},
                onSelectionChanged: (v) => state.setThemeMode(v.first),
              ),
            ),
            const SizedBox(height: 20),
            Text(t('disp.color'), style: TextStyle(color: slate)),
            const SizedBox(height: 8),
            Row(children: [
              for (final e in accents.entries)
                Padding(
                  padding: const EdgeInsetsDirectional.only(end: 14),
                  child: InkWell(
                    customBorder: const CircleBorder(),
                    onTap: () => state.setAccent(e.key),
                    child: Container(
                      width: 44, height: 44,
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        gradient: LinearGradient(colors: [e.value[0], e.value[0], e.value[2], e.value[2]], stops: const [0, 0.55, 0.55, 1], begin: Alignment.topLeft, end: Alignment.bottomRight),
                        border: Border.all(color: state.accent == e.key ? ink : line, width: state.accent == e.key ? 3 : 1),
                      ),
                      child: state.accent == e.key ? const Icon(Icons.check, color: Colors.white) : null,
                    ),
                  ),
                ),
            ]),
            const SizedBox(height: 20),
            Text(t('disp.size'), style: TextStyle(color: slate)),
            const SizedBox(height: 8),
            SizedBox(
              width: double.infinity,
              child: SegmentedButton<String>(
                showSelectedIcon: false,
                segments: const [
                  ButtonSegment(value: 's', label: Text('S')),
                  ButtonSegment(value: 'm', label: Text('M')),
                  ButtonSegment(value: 'l', label: Text('L')),
                ],
                selected: {state.gridSize},
                onSelectionChanged: (v) => state.setGridSize(v.first),
              ),
            ),
            const SizedBox(height: 16),
            Text(t('disp.cart'), style: TextStyle(color: slate)),
            const SizedBox(height: 8),
            SizedBox(
              width: double.infinity,
              child: SegmentedButton<String>(
                showSelectedIcon: false,
                segments: [
                  ButtonSegment(value: 'auto', label: Text(t('disp.auto'))),
                  ButtonSegment(value: 'side', label: Text(t('disp.side'))),
                  ButtonSegment(value: 'bottom', label: Text(t('disp.bottom'))),
                ],
                selected: {state.cartPos},
                onSelectionChanged: (v) => state.setCartPos(v.first),
              ),
            ),
            SwitchListTile(contentPadding: EdgeInsets.zero, title: Text(t('disp.cartopen')), value: state.cartOpen, onChanged: state.setCartOpen),
            SwitchListTile(contentPadding: EdgeInsets.zero, title: Text(t('disp.topbar')), value: state.headerShown, onChanged: state.setHeaderShown),
            const SizedBox(height: 12),
            Row(children: [
              Text(t('disp.zoom'), style: TextStyle(color: slate)),
              const Spacer(),
              Text('${(state.zoom * 100).round()}%', style: const TextStyle(fontWeight: FontWeight.w700)),
            ]),
            Row(children: [
              IconButton.outlined(onPressed: () => state.setZoom(state.zoom - 0.1), icon: const Icon(Icons.zoom_out)),
              Expanded(
                child: Slider(
                  min: 0.7, max: 1.8, divisions: 11,
                  value: state.zoom.clamp(0.7, 1.8),
                  onChanged: (v) => state.setZoom(v),
                ),
              ),
              IconButton.outlined(onPressed: () => state.setZoom(state.zoom + 0.1), icon: const Icon(Icons.zoom_in)),
            ]),
            const SizedBox(height: 8),
            Row(children: [
              TextButton(onPressed: () => state.setZoom(1.0), child: Text(t('disp.reset'))),
              const Spacer(),
              FilledButton(onPressed: () => Navigator.pop(context), child: Text(t('disp.done'))),
            ]),
          ]),
        ),
      ),
    );
  }
}

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
            constraints: const BoxConstraints(maxWidth: 520),
            margin: const EdgeInsets.all(16),
            padding: const EdgeInsets.all(28),
            decoration: BoxDecoration(color: surface, borderRadius: BorderRadius.circular(24)),
            child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
              Row(children: [
                Expanded(child: Text(t('setup.title'), style: const TextStyle(fontSize: 28, fontWeight: FontWeight.w700))),
                displayButton(context, widget.state),
                langButton(widget.state),
              ]),
              const SizedBox(height: 8),
              Text(t('setup.help'), style: TextStyle(color: slate, fontSize: 16)),
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
                backgroundColor: surface,
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
      note = Text(widget.state.syncMessage!, style: TextStyle(color: slate));
    } else if (waitingCount > 0) {
      note = Text(t('pin.waiting', {'n': '$waitingCount'}), style: TextStyle(color: slate));
    }
    return Scaffold(
      body: Stack(children: [
        PositionedDirectional(top: 12, end: 16, child: Row(children: [displayButton(context, widget.state), langButton(widget.state)])),
        Center(
          child: SingleChildScrollView(
            child: Column(mainAxisSize: MainAxisSize.min, children: [
              Container(
                width: 56, height: 56, alignment: Alignment.center,
                decoration: BoxDecoration(color: saffron, borderRadius: BorderRadius.circular(16)),
                child: const Text('N', style: TextStyle(fontSize: 28, fontWeight: FontWeight.w800, color: onSaffron)),
              ),
              const SizedBox(height: 12),
              Text(t('pin.title'), style: const TextStyle(fontSize: 26, fontWeight: FontWeight.w700)),
              const SizedBox(height: 12),
              Text(pin.isEmpty ? '      ' : List.filled(pin.length, '●').join(' '),
                  style: TextStyle(fontSize: 28, letterSpacing: 4, color: cedar)),
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
                child: Text(t('pin.change'), style: TextStyle(color: slate)),
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

    final products = Padding(
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
                      filled: true, fillColor: surface,
                      border: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: BorderSide(color: line)),
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
                            style: TextStyle(color: slate, fontSize: 18)))
                        : GridView.builder(
                            gridDelegate: const SliverGridDelegateWithMaxCrossAxisExtent(
                                maxCrossAxisExtent: _tileW, mainAxisExtent: _tileH, crossAxisSpacing: 12, mainAxisSpacing: 12),
                            itemCount: shown.length,
                            itemBuilder: (_, i) => _tile(shown[i]),
                          ),
                  ),
                ]),
    );
    return Scaffold(
      body: Column(children: [
        if (s.headerShown) _header() else _headerStrip(),
        Expanded(
          child: LayoutBuilder(builder: (context, c) {
            final side = s.cartPos == 'side' || (s.cartPos == 'auto' && c.maxWidth >= 820);
            if (!s.cartOpen) return Column(children: [Expanded(child: products), _cartBar()]);
            if (side) return Row(children: [Expanded(child: products), _cartPanel(true)]);
            return Column(children: [
              Expanded(flex: 5, child: products),
              Expanded(flex: 6, child: _cartPanel(false)),
            ]);
          }),
        ),
      ]),
    );
  }

  Widget _chip(String label, bool on, VoidCallback onTap) => Padding(
        padding: const EdgeInsetsDirectional.only(end: 8),
        child: ChoiceChip(
          label: Text(label, style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600, color: on ? Colors.white : ink)),
          selected: on, onSelected: (_) => onTap(),
          selectedColor: cedar, backgroundColor: surface, showCheckmark: false,
          side: BorderSide(color: line),
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
        ),
      );

  double get _tileW => s.gridSize == 's' ? 140 : (s.gridSize == 'l' ? 260 : 190);
  double get _tileH => s.gridSize == 's' ? 128 : (s.gridSize == 'l' ? 220 : 168);

  Widget _tile(Product p) {
    final inCart = s.cart.where((l) => l.product.id == p.id).fold<int>(0, (a, l) => a + l.qty);
    final bytes = p.imageBytes;
    return InkWell(
      borderRadius: BorderRadius.circular(16),
      onTap: () { s.add(p); searchFocus.requestFocus(); },
      child: Container(
        padding: const EdgeInsets.all(8),
        decoration: BoxDecoration(
          color: surface, borderRadius: BorderRadius.circular(16),
          border: Border.all(color: inCart > 0 ? cedar : line, width: inCart > 0 ? 2 : 1),
        ),
        child: Stack(children: [
          Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Expanded(
              child: ClipRRect(
                borderRadius: BorderRadius.circular(10),
                child: SizedBox.expand(
                  child: bytes != null
                      ? Image.memory(bytes, fit: BoxFit.cover, gaplessPlayback: true)
                      : Container(
                          color: okBg, alignment: Alignment.center,
                          child: Text(p.name.substring(0, 1).toUpperCase(), style: TextStyle(color: dark(context) ? cedarLight : cedarDeep, fontSize: 30, fontWeight: FontWeight.w700)),
                        ),
                ),
              ),
            ),
            const SizedBox(height: 6),
            Text(p.name, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600)),
            Text(usd(p.priceCents), style: TextStyle(fontSize: 17, fontWeight: FontWeight.w700, color: dark(context) ? cedarLight : cedar)),
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
    final count = s.cart.fold<int>(0, (a, l) => a + l.qty);
    return Container(
      height: 64, padding: const EdgeInsets.symmetric(horizontal: 12),
      decoration: BoxDecoration(color: surface, border: Border(bottom: BorderSide(color: line))),
      child: LayoutBuilder(builder: (context, c) {
        final compact = c.maxWidth < 760;
        final tiny = c.maxWidth < 430;
        Widget action(IconData icon, String label, Widget Function() page) => compact
            ? IconButton(tooltip: label, icon: Icon(icon), onPressed: () => Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => page())))
            : TextButton.icon(
                onPressed: () => Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => page())),
                icon: Icon(icon), label: Text(label));
        return Row(children: [
          Container(
            width: 36, height: 36, alignment: Alignment.center,
            decoration: BoxDecoration(color: saffron, borderRadius: BorderRadius.circular(10)),
            child: const Text('N', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 18, color: onSaffron)),
          ),
          if (!compact) ...[
            const SizedBox(width: 10),
            Text(t('sell.title'), style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w700)),
          ],
          const SizedBox(width: 4),
          action(Icons.undo, t('nav.returns'), () => ReturnsScreen(state: s)),
          action(Icons.access_time, t('nav.shift'), () => ShiftScreen(state: s)),
          const Spacer(),
          Tooltip(
            message: text,
            child: InkWell(
              onTap: () => s.sync(),
              borderRadius: BorderRadius.circular(22),
              child: Container(
                height: 38, padding: EdgeInsets.symmetric(horizontal: tiny ? 10 : 14),
                decoration: BoxDecoration(color: isOnline && n == 0 ? okBg : waiting, borderRadius: BorderRadius.circular(22)),
                child: Row(children: [
                  Icon(Icons.circle, size: 10, color: isOnline && n == 0 ? const Color(0xFF1B8A6B) : const Color(0xFFC98A00)),
                  if (!tiny) ...[
                    const SizedBox(width: 8),
                    ConstrainedBox(
                      constraints: BoxConstraints(maxWidth: compact ? 110 : 220),
                      child: Text(text, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14)),
                    ),
                  ] else if (n > 0) ...[
                    const SizedBox(width: 6),
                    Text('$n', style: const TextStyle(fontWeight: FontWeight.w700)),
                  ],
                ]),
              ),
            ),
          ),
          const SizedBox(width: 4),
          IconButton(
            tooltip: s.cartOpen ? t('cart.hide') : t('cart.show'),
            onPressed: () => s.setCartOpen(!s.cartOpen),
            icon: Badge(isLabelVisible: count > 0, label: Text('$count'), child: Icon(s.cartOpen ? Icons.shopping_cart : Icons.shopping_cart_outlined)),
          ),
          UserMenu(state: s, compact: compact),
        ]);
      }),
    );
  }

  Widget _headerStrip() => Material(
        color: surface,
        child: InkWell(
          onTap: () => s.setHeaderShown(true),
          child: Container(
            height: 26, alignment: Alignment.center,
            decoration: BoxDecoration(border: Border(bottom: BorderSide(color: line))),
            child: Row(mainAxisSize: MainAxisSize.min, children: [
              const Icon(Icons.keyboard_arrow_down, size: 20),
              Text(t('bar.show'), style: TextStyle(fontSize: 12, color: slate)),
            ]),
          ),
        ),
      );

  Widget _cartBar() {
    final tt = s.totals;
    final count = s.cart.fold<int>(0, (a, l) => a + l.qty);
    return Material(
      color: cedarDeep,
      child: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(12, 8, 12, 8),
          child: Row(children: [
            IconButton(
              tooltip: t('cart.show'),
              onPressed: () => s.setCartOpen(true),
              icon: Badge(isLabelVisible: count > 0, label: Text('$count'), child: const Icon(Icons.shopping_cart, color: Colors.white)),
            ),
            Expanded(child: Text(usd(tt.total), style: const TextStyle(color: Colors.white, fontSize: 24, fontWeight: FontWeight.w800))),
            FilledButton(
              style: saffronButton().copyWith(minimumSize: const WidgetStatePropertyAll(Size(140, 48))),
              onPressed: s.cart.isEmpty ? null : _pay,
              child: Text(t('sell.pay')),
            ),
          ]),
        ),
      ),
    );
  }

  Widget _cartPanel(bool wide) {
    final tt = s.totals;
    final header = Padding(
      padding: const EdgeInsetsDirectional.fromSTEB(20, 16, 12, 8),
      child: Row(children: [
        Text(t('sell.current'), style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w700)),
        const Spacer(),
        if (s.cart.isNotEmpty) TextButton(onPressed: s.clearCart, child: Text(t('sell.clear'))),
        IconButton(tooltip: t('cart.hide'), icon: const Icon(Icons.keyboard_arrow_down), onPressed: () => s.setCartOpen(false)),
      ]),
    );
    final lines = <Widget>[
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
    ];
    final empty = Center(child: Padding(
      padding: const EdgeInsets.all(20),
      child: Text(t('sell.tap'), style: TextStyle(color: slate, fontSize: 17)),
    ));
    final discount = Padding(
      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 8),
      child: Wrap(crossAxisAlignment: WrapCrossAlignment.center, spacing: 8, runSpacing: 4, children: [
        Text(t('sell.discount'), style: TextStyle(color: slate)),
        for (final p in [0, 5, if (s.canDiscount10) 10])
          ChoiceChip(
            label: Text(p == 0 ? t('sell.none') : '$p%'),
            selected: s.discountPercent == p, onSelected: (_) => s.setDiscount(p),
          ),
      ]),
    );
    final totals = Container(
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
    );
    final pay = Padding(
      padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
      child: FilledButton(
        style: saffronButton(),
        onPressed: s.cart.isEmpty ? null : _pay,
        child: Text(t('sell.pay')),
      ),
    );
    return Container(
      width: wide ? 400 : null,
      decoration: BoxDecoration(
        color: surface,
        border: wide ? BorderDirectional(start: BorderSide(color: line)) : Border(top: BorderSide(color: line)),
      ),
      child: LayoutBuilder(builder: (context, c) {
        // On a short screen the whole panel scrolls, so nothing is ever cut off.
        if (c.maxHeight < 560) {
          return ListView(children: [header, if (s.cart.isEmpty) empty else ...lines, discount, totals, pay]);
        }
        return Column(children: [
          header,
          Expanded(child: s.cart.isEmpty ? empty : ListView(children: lines)),
          discount, totals, pay,
        ]);
      }),
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
          Text(lbp(tt.total, s.lbpRate), style: TextStyle(fontSize: 18, color: slate)),
          const SizedBox(height: 20),
          for (final o in [['usd', t('pay.usd')], ['lbp', t('pay.lbp')], ['card', t('pay.card')]])
            Padding(
              padding: const EdgeInsets.only(bottom: 10),
              child: SizedBox(
                width: (MediaQuery.of(context).size.width - 140).clamp(160.0, 320.0), height: 60,
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
          Text(s.online ? t('done.uploading') : t('done.saved'), style: TextStyle(color: slate)),
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

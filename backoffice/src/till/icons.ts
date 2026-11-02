const MAP: [RegExp, string][] = [
  [/coffee|espresso|latte|cappuccino|nescafe|قهوة/i, '☕'], [/tea|شاي/i, '🍵'], [/juice|عصير|orange/i, '🧃'], [/water|مياه|sparkl/i, '💧'],
  [/jallab|drink|soda|cola|pepsi/i, '🥤'], [/beer|بيرة/i, '🍺'], [/wine|نبيذ/i, '🍷'],
  [/croissant/i, '🥐'], [/manoush|zaatar|pizza|pie|فطير|منقوش/i, '🥙'], [/ka.?ak|bread|خبز|bagel|toast/i, '🥖'], [/cake|كعك|cookie|biscuit|حلو|sweet/i, '🍰'],
  [/cheese|halloumi|جبن|حلوم/i, '🧀'], [/labneh|milk|yogh?urt|dairy|لبن|حليب/i, '🥛'], [/egg|بيض/i, '🥚'],
  [/chicken|دجاج/i, '🍗'], [/meat|beef|lamb|لحم|burger/i, '🍔'], [/fish|سمك|tuna/i, '🐟'],
  [/apple|تفاح/i, '🍎'], [/banana|موز/i, '🍌'], [/fruit|فاكه/i, '🍇'], [/tomato|بندور/i, '🍅'], [/vegetable|potato|خضار|salad/i, '🥗'],
  [/chocolate|شوكولا/i, '🍫'], [/chips|snack/i, '🍿'], [/rice|pasta|أرز/i, '🍚'], [/soap|shampoo|clean|صابون/i, '🧼'], [/paper|tissue|ورق/i, '🧻']
];
/** A built-in picture for an item without an uploaded photo. */
export function iconFor(name: string): string {
  for (const [re, ic] of MAP) if (re.test(name)) return ic;
  return '🛒';
}

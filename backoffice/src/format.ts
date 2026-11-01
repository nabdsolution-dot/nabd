import { dateLocale, t } from './i18n';

export function usd(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  return sign + '$' + (Math.abs(cents) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function lbp(cents: number, rate: number): string {
  return Math.round((cents * rate) / 100).toLocaleString('en-US') + ' LBP';
}

export function parseUsdToCents(input: string): number | null {
  const t = input.trim().replace(/^\$/, '');
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return null;
  const [whole, frac = ''] = t.split('.');
  return Number(whole) * 100 + Number((frac + '00').slice(0, 2));
}

export function timeAgo(iso: string | null, now = Date.now()): string {
  if (!iso) return t('Never');
  const mins = Math.floor((now - new Date(iso).getTime()) / 60000);
  if (mins < 1) return t('Just now');
  if (mins < 60) return t('{n} min ago', { n: mins });
  const d = new Date(iso);
  return d.toLocaleString(dateLocale(), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export function pctText(p: number | null, label: string): { text: string; good: boolean } {
  if (p === null) return { text: t('No data for {label}', { label: t(label) }), good: true };
  return { text: t('{p} vs {label}', { p: (p >= 0 ? '+' : '') + p + '%', label: t(label) }), good: p >= 0 };
}

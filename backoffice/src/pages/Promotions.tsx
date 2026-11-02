import { useMemo, useState, type FormEvent } from 'react';
import { PageHeader } from '../components/Layout';
import { Banner, Field, Loading, LoadError, Pill } from '../components/ui';
import { useLoad } from '../useLoad';
import { api, type Loyalty, type Product, type Promotion } from '../api';
import { parseUsdToCents, usd } from '../format';
import { errText, t } from '../i18n';

const kindName = (k: Promotion['kind']) => (k === 'bundle' ? t('Mix and match bundle') : k === 'percent' ? t('Percent off') : t('Buy more, cheapest free'));

function describe(p: Promotion): string {
  if (p.kind === 'bundle') return t('Any {n} of the chosen items for {price}', { n: p.qty, price: usd(p.priceCents ?? 0) });
  if (p.kind === 'percent') return t('{pct}% off when you buy {n} or more', { pct: p.percent ?? 0, n: p.qty });
  return t('In every {n}, the cheapest is {pct}% off', { n: p.qty, pct: p.percent ?? 0 });
}

export function Promotions() {
  const list = useLoad<Promotion[]>('/promotions?all=1');
  const products = useLoad<{ items: Product[] }>('/products?limit=200');
  const [editing, setEditing] = useState<Promotion | 'new' | null>(null);
  const names = useMemo(() => new Map((products.data?.items ?? []).map((p) => [p.id, p.name])), [products.data]);

  return (
    <>
      <PageHeader title={t('Promotions and loyalty')} actions={<button className="btn btn-primary" onClick={() => setEditing('new')}>{t('Add promotion')}</button>} />
      <main className="content">
        <div className="split">
          <div style={{ flex: '2 1 520px', minWidth: 0, display: 'grid', gap: 24 }}>
            <section className="card" aria-label={t('Promotions')}>
              {list.loading && !list.data && <Loading what="promotions" />}
              {list.error && <LoadError message={list.error} retry={list.reload} />}
              {list.data && (
                <div className="table-wrap"><table>
                  <thead><tr><th>{t('Promotion')}</th><th>{t('Rule')}</th><th>{t('Dates')}</th><th /></tr></thead>
                  <tbody>
                    {list.data.length === 0 && <tr><td colSpan={4} className="muted">{t('No promotions yet.')}</td></tr>}
                    {list.data.map((p) => (
                      <tr key={p.id} className="selectable" onClick={() => setEditing(p)}>
                        <td className="strong">{p.name} {!p.active && <Pill kind="neutral">{t('Off')}</Pill>}</td>
                        <td className="muted">{describe(p)}<br /><span style={{ fontSize: 13 }}>{p.productIds.map((id) => names.get(id) ?? '…').slice(0, 4).join(', ')}{p.productIds.length > 4 ? ` +${p.productIds.length - 4}` : ''}</span></td>
                        <td className="muted">{p.startsOn || p.endsOn ? `${p.startsOn ?? '…'} → ${p.endsOn ?? '…'}` : t('Always')}</td>
                        <td><button className="btn" onClick={(e) => { e.stopPropagation(); setEditing(p); }}>{t('Edit')}</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table></div>
              )}
            </section>
            <LoyaltyCard />
          </div>
          {editing && <PromoForm key={editing === 'new' ? 'new' : editing.id} promo={editing === 'new' ? null : editing} products={products.data?.items ?? []}
            onClose={() => setEditing(null)} onSaved={() => { setEditing(null); list.reload(); }} />}
        </div>
      </main>
    </>
  );
}

function LoyaltyCard() {
  const cur = useLoad<{ loyalty: Loyalty }>('/settings');
  const [form, setForm] = useState<{ enabled: boolean; earn: string; value: string } | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const l = cur.data?.loyalty;
  const f = form ?? (l ? { enabled: l.enabled, earn: String(l.earnPerUsd), value: String(l.pointValueCents) } : null);
  if (!f) return <section className="card card-pad"><Loading what="loyalty" /></section>;
  async function save(e: FormEvent) {
    e.preventDefault();
    const earn = Number(f!.earn); const value = Number(f!.value);
    if (!(earn >= 0) || !Number.isInteger(value) || value < 1) return setMsg({ ok: false, text: t('Use a number for points per dollar and a whole number of cents per point.') });
    try { await api('PUT', '/settings/loyalty', { enabled: f!.enabled, earnPerUsd: earn, pointValueCents: value }); setMsg({ ok: true, text: t('Saved. Tills pick this up on their next sync.') }); cur.reload(); }
    catch (err) { setMsg({ ok: false, text: errText(err) }); }
  }
  return (
    <section className="card card-pad" aria-label={t('Loyalty points')}>
      <h2 style={{ marginTop: 0 }}>{t('Loyalty points')}</h2>
      <form onSubmit={save} style={{ display: 'grid', gap: 14 }}>
        {msg && <Banner kind={msg.ok ? 'success' : 'error'}>{msg.text}</Banner>}
        <label style={{ display: 'flex', gap: 10, alignItems: 'center' }}><input type="checkbox" checked={f.enabled} onChange={(e) => setForm({ ...f, enabled: e.target.checked })} style={{ width: 20, height: 20 }} /> {t('Customers earn and spend points')}</label>
        <div className="fields">
          <Field id="l-earn" label={t('Points earned per $1 spent')}><input id="l-earn" className="input num" inputMode="decimal" value={f.earn} onChange={(e) => setForm({ ...f, earn: e.target.value })} /></Field>
          <Field id="l-val" label={t('Value of one point, in cents')} hint={t('100 points are worth {v}', { v: usd(Number(f.value) * 100 || 0) })}><input id="l-val" className="input num" inputMode="numeric" value={f.value} onChange={(e) => setForm({ ...f, value: e.target.value })} /></Field>
        </div>
        <button className="btn btn-primary" type="submit" style={{ height: 48 }}>{t('Save loyalty rules')}</button>
      </form>
    </section>
  );
}

function PromoForm({ promo, products, onClose, onSaved }: { promo: Promotion | null; products: Product[]; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(promo?.name ?? '');
  const [kind, setKind] = useState<Promotion['kind']>(promo?.kind ?? 'bundle');
  const [qty, setQty] = useState(String(promo?.qty ?? 2));
  const [price, setPrice] = useState(promo?.priceCents != null ? (promo.priceCents / 100).toFixed(2) : '');
  const [percent, setPercent] = useState(String(promo?.percent ?? (kind === 'buy_get' ? 100 : 10)));
  const [ids, setIds] = useState<string[]>(promo?.productIds ?? []);
  const [startsOn, setStartsOn] = useState(promo?.startsOn ?? '');
  const [endsOn, setEndsOn] = useState(promo?.endsOn ?? '');
  const [active, setActive] = useState(promo?.active ?? true);
  const [q, setQ] = useState('');
  const [error, setError] = useState<string | null>(null);
  const shown = products.filter((p) => !q || p.name.toLowerCase().includes(q.toLowerCase()));

  async function save(e: FormEvent) {
    e.preventDefault(); setError(null);
    const n = Number(qty); const cents = parseUsdToCents(price); const pct = Number(percent);
    if (!name.trim()) return setError(t('Enter a name.'));
    if (!ids.length) return setError(t('Choose at least one product.'));
    if (!Number.isInteger(n) || n < 1) return setError(t('Quantity must be a whole number.'));
    if (kind === 'bundle' && cents === null) return setError(t('Enter the bundle price like 4.00.'));
    if (kind !== 'bundle' && (!Number.isInteger(pct) || pct < 1 || pct > 100)) return setError(t('Percent must be between 1 and 100.'));
    const body = { name: name.trim(), kind, productIds: ids, qty: n, priceCents: kind === 'bundle' ? cents : null, percent: kind === 'bundle' ? null : pct, active, startsOn: startsOn || null, endsOn: endsOn || null };
    try { if (promo) await api('PUT', '/promotions/' + promo.id, body); else await api('POST', '/promotions', body); onSaved(); }
    catch (err) { setError(errText(err)); }
  }
  const toggle = (id: string) => setIds((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));

  return (
    <aside className="card panel" style={{ maxWidth: 560 }} aria-label={promo ? t('Edit promotion') : t('Add promotion')}>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}><h2 style={{ margin: 0, fontSize: 20 }}>{promo ? promo.name : t('New promotion')}</h2><button className="btn btn-ghost" onClick={onClose}>{t('Close')}</button></div>
      <form onSubmit={save} style={{ display: 'grid', gap: 14 }} noValidate>
        {error && <Banner kind="error">{error}</Banner>}
        <Field id="pr-name" label={t('Name')}><input id="pr-name" className="input" value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field id="pr-kind" label={t('Type')}>
          <select id="pr-kind" className="select" value={kind} onChange={(e) => setKind(e.target.value as Promotion['kind'])}>
            <option value="bundle">{kindName('bundle')}</option><option value="percent">{kindName('percent')}</option><option value="buy_get">{kindName('buy_get')}</option>
          </select>
        </Field>
        <div className="fields">
          <Field id="pr-qty" label={kind === 'bundle' ? t('Items in the bundle') : kind === 'percent' ? t('Minimum items') : t('Group size')}><input id="pr-qty" className="input num" inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value)} /></Field>
          {kind === 'bundle'
            ? <Field id="pr-price" label={t('Bundle price, USD')}><input id="pr-price" className="input num" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} /></Field>
            : <Field id="pr-pct" label={kind === 'buy_get' ? t('Percent off the cheapest (100 = free)') : t('Percent off')}><input id="pr-pct" className="input num" inputMode="numeric" value={percent} onChange={(e) => setPercent(e.target.value)} /></Field>}
        </div>
        <div className="fields">
          <Field id="pr-from" label={t('Starts')}><input id="pr-from" className="input" type="date" value={startsOn} onChange={(e) => setStartsOn(e.target.value)} /></Field>
          <Field id="pr-to" label={t('Ends')}><input id="pr-to" className="input" type="date" value={endsOn} onChange={(e) => setEndsOn(e.target.value)} /></Field>
        </div>
        <div>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>{t('Products in this promotion')} ({ids.length})</div>
          <input className="input" type="search" aria-label={t('Search products')} placeholder={t('Search products')} value={q} onChange={(e) => setQ(e.target.value)} />
          <div style={{ maxHeight: 220, overflow: 'auto', border: '1px solid var(--line)', borderRadius: 10, marginTop: 8, padding: 6 }}>
            {shown.map((p) => (
              <label key={p.id} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '6px 4px' }}>
                <input type="checkbox" checked={ids.includes(p.id)} onChange={() => toggle(p.id)} style={{ width: 18, height: 18 }} /> {p.name} <span className="muted" style={{ marginInlineStart: 'auto' }}>{usd(p.priceCents)}</span>
              </label>
            ))}
          </div>
        </div>
        <label style={{ display: 'flex', gap: 10, alignItems: 'center' }}><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} style={{ width: 20, height: 20 }} /> {t('Switched on')}</label>
        <div className="fields">
          <button className="btn btn-primary" type="submit" style={{ flex: '1 1 120px', height: 48 }}>{t('Save')}</button>
          {promo && <button className="btn btn-danger" type="button" style={{ flex: '1 1 120px', height: 48 }} onClick={async () => { try { await api('DELETE', '/promotions/' + promo.id); onSaved(); } catch (e) { setError(errText(e)); } }}>{t('Switch off')}</button>}
        </div>
      </form>
    </aside>
  );
}

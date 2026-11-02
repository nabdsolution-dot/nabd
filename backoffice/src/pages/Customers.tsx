import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { PageHeader } from '../components/Layout';
import { Banner, Field, Loading, LoadError, Pill } from '../components/ui';
import { useLoad } from '../useLoad';
import { api, type Customer, type Statement } from '../api';
import { parseUsdToCents, usd } from '../format';
import { dateLocale, errText, t } from '../i18n';

const today = () => new Date().toISOString().slice(0, 10);
const monthAgo = () => new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);

export function Customers() {
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [selected, setSelected] = useState<string | 'new' | null>(null);
  useEffect(() => { const x = setTimeout(() => setDebounced(search), 250); return () => clearTimeout(x); }, [search]);
  const qs = useMemo(() => '/customers?all=1&limit=100' + (debounced ? '&search=' + encodeURIComponent(debounced) : ''), [debounced]);
  const list = useLoad<Customer[]>(qs);

  return (
    <>
      <PageHeader title={t('Customers')} sub={list.data ? t('{n} customers', { n: list.data.length }) : undefined}
        actions={<button className="btn btn-primary" onClick={() => setSelected('new')}>{t('Add customer')}</button>} />
      <main className="content">
        <div className="split">
          <section className="card" style={{ flex: '2 1 520px', minWidth: 0 }} aria-label={t('Customer list')}>
            <div className="toolbar">
              <label htmlFor="csearch" className="sr-only">{t('Search customers')}</label>
              <input id="csearch" className="input" type="search" placeholder={t('Search name, phone or card number')} value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            {list.loading && !list.data && <Loading what="customers" />}
            {list.error && <LoadError message={list.error} retry={list.reload} />}
            {list.data && (
              <div className="table-wrap">
                <table>
                  <thead><tr><th>{t('Customer')}</th><th>{t('Phone')}</th><th className="num">{t('Points')}</th><th className="num">{t('Owes')}</th></tr></thead>
                  <tbody>
                    {list.data.length === 0 && <tr><td colSpan={4} className="muted">{t('No customers yet. Add one, or add them from the till.')}</td></tr>}
                    {list.data.map((c) => (
                      <tr key={c.id} className={'selectable' + (selected === c.id ? ' selected' : '')} onClick={() => setSelected(c.id)}>
                        <td className="strong">{c.name}{!c.active && <> <Pill kind="neutral">{t('Inactive')}</Pill></>}</td>
                        <td className="muted" dir="ltr" style={{ textAlign: 'start' }}>{c.phone}</td>
                        <td className="num">{c.points}</td>
                        <td className="num">{c.balanceCents !== 0 ? <Pill kind={c.balanceCents > 0 ? 'warn' : 'ok'}>{usd(c.balanceCents)}</Pill> : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
          {selected && <CustomerPanel key={selected} id={selected === 'new' ? null : selected} onClose={() => setSelected(null)} onChanged={(id) => { setSelected(id); list.reload(); }} />}
        </div>
      </main>
    </>
  );
}

function CustomerPanel({ id, onClose, onChanged }: { id: string | null; onClose: () => void; onChanged: (id: string) => void }) {
  const one = useLoad<Customer>(id ? '/customers/' + id : null);
  const c = one.data;
  const [form, setForm] = useState({ name: '', phone: '', email: '', address: '', notes: '', birthday: '', limit: '0', active: true });
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState<'info' | 'statement'>('info');

  useEffect(() => {
    if (c) setForm({ name: c.name, phone: c.phone ?? '', email: c.email ?? '', address: c.address ?? '', notes: c.notes ?? '', birthday: c.birthday ?? '', limit: (c.creditLimitCents / 100).toFixed(2), active: c.active });
  }, [c]);

  const set = (k: keyof typeof form, v: string | boolean) => setForm((f) => ({ ...f, [k]: v }));

  async function save(e: FormEvent) {
    e.preventDefault(); setError(null); setSaved(false);
    const limit = parseUsdToCents(form.limit);
    if (!form.name.trim()) return setError(t('Enter a name.'));
    if (limit === null) return setError(t('Enter a credit limit like 200.00.'));
    setBusy(true);
    try {
      const body = { name: form.name.trim(), phone: form.phone.trim() || null, email: form.email.trim() || null, address: form.address.trim() || null, notes: form.notes.trim() || null, birthday: form.birthday || null, creditLimitCents: limit, active: form.active };
      const r = id ? await api<Customer>('PATCH', '/customers/' + id, body) : await api<Customer>('POST', '/customers', body);
      setSaved(true); onChanged(r.id);
    } catch (err) { setError(errText(err)); } finally { setBusy(false); }
  }

  return (
    <aside className="card panel" style={{ maxWidth: 780, flex: '1 1 560px' }} aria-label={id ? t('Edit customer') : t('Add customer')}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20 }}>{c ? c.name : t('New customer')}</h2>
          {c && <span className="muted" style={{ fontSize: 14 }}>{t('Card {code}', { code: c.code ?? '—' })} · {t('{n} points', { n: c.points })} · {t('Owes')} {usd(c.balanceCents)}</span>}
        </div>
        <button className="btn btn-ghost" style={{ height: 36, padding: '0 8px' }} onClick={onClose}>{t('Close')}</button>
      </div>
      {id && (
        <div style={{ display: 'flex', gap: 8 }}>
          <button className={'chip' + (view === 'info' ? ' on' : '')} onClick={() => setView('info')}>{t('Details')}</button>
          <button className={'chip' + (view === 'statement' ? ' on' : '')} onClick={() => setView('statement')}>{t('Statement')}</button>
        </div>
      )}
      {view === 'info' && (
        <form onSubmit={save} style={{ display: 'flex', flexDirection: 'column', gap: 16 }} noValidate>
          {error && <Banner kind="error">{error}</Banner>}
          {saved && <Banner kind="success">{t('Saved.')}</Banner>}
          <Field id="c-name" label={t('Name')}><input id="c-name" className="input" value={form.name} onChange={(e) => set('name', e.target.value)} /></Field>
          <div className="fields">
            <Field id="c-phone" label={t('Phone')}><input id="c-phone" className="input" dir="ltr" value={form.phone} onChange={(e) => set('phone', e.target.value)} /></Field>
            <Field id="c-email" label={t('Email')}><input id="c-email" className="input" dir="ltr" value={form.email} onChange={(e) => set('email', e.target.value)} /></Field>
          </div>
          <Field id="c-addr" label={t('Address')}><input id="c-addr" className="input" value={form.address} onChange={(e) => set('address', e.target.value)} /></Field>
          <div className="fields">
            <Field id="c-bday" label={t('Birthday')}><input id="c-bday" className="input" type="date" value={form.birthday} onChange={(e) => set('birthday', e.target.value)} /></Field>
            <Field id="c-limit" label={t('Credit limit, USD')} hint={t('0 means no buying on account.')}><input id="c-limit" className="input num" inputMode="decimal" value={form.limit} onChange={(e) => set('limit', e.target.value)} /></Field>
          </div>
          <Field id="c-notes" label={t('Notes')}><input id="c-notes" className="input" value={form.notes} onChange={(e) => set('notes', e.target.value)} /></Field>
          <label style={{ display: 'flex', gap: 10, alignItems: 'center' }}><input type="checkbox" checked={form.active} onChange={(e) => set('active', e.target.checked)} style={{ width: 20, height: 20 }} /> {t('Active')}</label>
          <button className="btn btn-primary" type="submit" disabled={busy} style={{ height: 48 }}>{busy ? t('Saving…') : id ? t('Save changes') : t('Add customer')}</button>
          {c && <Money customer={c} onDone={() => { one.reload(); onChanged(c.id); }} />}
        </form>
      )}
      {view === 'statement' && c && <StatementView customer={c} />}
      {one.loading && !c && id && <Loading what="customer" />}
      {one.error && <LoadError message={one.error} retry={one.reload} />}
    </aside>
  );
}

/** Take a payment against the account, or adjust points or balance. */
function Money({ customer, onDone }: { customer: Customer; onDone: () => void }) {
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('cash');
  const [note, setNote] = useState('');
  const [pts, setPts] = useState('');
  const [adjNote, setAdjNote] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function pay() {
    const cents = parseUsdToCents(amount);
    if (!cents) return setMsg({ ok: false, text: t('Enter an amount like 25.00.') });
    try { await api('POST', `/customers/${customer.id}/payments`, { amountCents: cents, method, note: note || null }); setAmount(''); setNote(''); setMsg({ ok: true, text: t('Payment recorded.') }); onDone(); }
    catch (e) { setMsg({ ok: false, text: errText(e) }); }
  }
  async function adjust() {
    const p = Number(pts);
    if (!Number.isInteger(p) || p === 0) return setMsg({ ok: false, text: t('Enter whole points, like 50 or -20.') });
    try { await api('POST', `/customers/${customer.id}/adjust`, { points: p, note: adjNote }); setPts(''); setAdjNote(''); setMsg({ ok: true, text: t('Points adjusted.') }); onDone(); }
    catch (e) { setMsg({ ok: false, text: errText(e) }); }
  }
  return (
    <div className="note" style={{ display: 'grid', gap: 12 }}>
      {msg && <Banner kind={msg.ok ? 'success' : 'error'}>{msg.text}</Banner>}
      <strong>{t('Receive a payment')}</strong>
      <div className="fields">
        <input className="input num" aria-label={t('Amount, USD')} placeholder={t('Amount, USD')} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
        <select className="select" aria-label={t('Method')} value={method} onChange={(e) => setMethod(e.target.value)}>
          <option value="cash">{t('Cash')}</option><option value="card">{t('Card')}</option><option value="transfer">{t('Transfer')}</option><option value="other">{t('Other')}</option>
        </select>
      </div>
      <input className="input" aria-label={t('Note')} placeholder={t('Note (optional)')} value={note} onChange={(e) => setNote(e.target.value)} />
      <button type="button" className="btn" onClick={pay}>{t('Record payment')}</button>
      <strong>{t('Adjust points')}</strong>
      <div className="fields">
        <input className="input num" aria-label={t('Points')} placeholder={t('Points, like 50 or -20')} inputMode="numeric" value={pts} onChange={(e) => setPts(e.target.value)} />
        <input className="input" aria-label={t('Reason')} placeholder={t('Reason')} value={adjNote} onChange={(e) => setAdjNote(e.target.value)} />
      </div>
      <button type="button" className="btn" onClick={adjust}>{t('Adjust')}</button>
    </div>
  );
}

function StatementView({ customer }: { customer: Customer }) {
  const [from, setFrom] = useState(monthAgo());
  const [to, setTo] = useState(today());
  const st = useLoad<Statement>(`/customers/${customer.id}/statement?from=${from}&to=${to}`);
  const kindText: Record<string, string> = { sale: t('Sale'), payment: t('Payment'), refund: t('Refund'), adjustment: t('Adjustment') };
  const d = st.data;
  return (
    <div style={{ display: 'grid', gap: 12, minWidth: 0 }}>
      <div className="fields">
        <Field id="s-from" label={t('From')}><input id="s-from" className="input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
        <Field id="s-to" label={t('To')}><input id="s-to" className="input" type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
        <button className="btn" style={{ alignSelf: 'end' }} onClick={() => window.print()}>{t('Print')}</button>
      </div>
      {st.loading && !d && <Loading what="statement" />}
      {st.error && <LoadError message={st.error} retry={st.reload} />}
      {d && (
        <div id="statement" style={{ minWidth: 0 }}>
          <h3 style={{ margin: '0 0 4px' }}>{t('Statement for {name}', { name: d.customer.name })}</h3>
          <div className="muted" style={{ marginBottom: 8 }}>{d.from} → {d.to}</div>
          <div className="table-wrap" style={{ overflowX: 'auto' }}><table>
            <thead><tr><th>{t('Date')}</th><th>{t('Type')}</th><th>{t('Receipt')}</th><th className="num">{t('Amount')}</th><th className="num">{t('Balance')}</th><th className="num">{t('Points')}</th></tr></thead>
            <tbody>
              <tr><td colSpan={4} className="muted">{t('Opening balance')}</td><td className="num">{usd(d.openingCents)}</td><td className="num">{d.openingPoints}</td></tr>
              {d.lines.map((l) => (
                <tr key={l.id}>
                  <td>{new Date(l.at).toLocaleDateString(dateLocale())}</td>
                  <td>{kindText[l.kind]}{l.method ? ` (${l.method})` : ''}{l.note ? ` — ${l.note}` : ''}</td>
                  <td className="muted" dir="ltr">{l.ref}</td>
                  <td className="num">{l.amountCents ? usd(l.amountCents) : '—'}</td>
                  <td className="num">{usd(l.balanceCents)}</td>
                  <td className="num">{l.points > 0 ? '+' : ''}{l.points || ''}</td>
                </tr>
              ))}
              <tr><td colSpan={4} className="strong">{t('Closing balance')}</td><td className="num strong">{usd(d.closingCents)}</td><td className="num strong">{d.closingPoints}</td></tr>
            </tbody>
          </table></div>
        </div>
      )}
    </div>
  );
}

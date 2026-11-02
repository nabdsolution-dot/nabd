import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { Customer, Product } from '../api';
import { iconFor } from './icons';
import { LangSwitch, t } from '../i18n';

const errText = (e: unknown): string => (e instanceof Error ? t(e.message) : t('Something went wrong.'));
import { lbp, parseUsdToCents, usd } from '../format';
import * as S from './store';
import type { Sale, SaleLookup } from './store';
import './till.css';
import { AccentPicker } from '../accent';

const useStore = () => useSyncExternalStore(S.subscribe, S.getState);

function Setup() {
  const [stores, setStores] = useState<Awaited<ReturnType<typeof S.loadStores>> | null>(null);
  const [err, setErr] = useState('');
  const [storeId, setStoreId] = useState('');
  useEffect(() => { S.loadStores().then((s) => { setStores(s); setStoreId(s[0]?.id ?? ''); }).catch((e) => setErr(errText(e))); }, []);
  const store = stores?.find((s) => s.id === storeId);
  return (
    <div className="tl-center"><div className="tl-card">
      <h1>{t('Set up this till')}</h1>
      {err && <p role="alert" className="tl-err">{err}</p>}
      {!stores && !err && <p>{t('Loading…')}</p>}
      {stores && stores.length === 0 && <p>{t('No stores yet. Add one in the back office first.')}</p>}
      {stores && stores.length > 0 && <>
        <label>{t('Store')}<select value={storeId} onChange={(e) => setStoreId(e.target.value)}>{stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
        <p className="tl-sub">{t('Pick this register:')}</p>
        <div className="tl-row">{store?.tills.map((tl) => (
          <button key={tl.id} className="tl-btn" onClick={() => S.saveSetup({ storeId: store.id, tillId: tl.id, storeName: store.name, tillName: tl.name })}>{tl.name}</button>
        ))}</div>
        {store?.tills.length === 0 && <p>{t('This store has no registers yet.')}</p>}
      </>}
    </div></div>
  );
}

function PinPad({ onDone, title, onCancel }: { onDone: (pin: string) => void; title: string; onCancel?: () => void }) {
  const [pin, setPin] = useState('');
  const push = (d: string) => setPin((p) => (p.length < 6 ? p + d : p));
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (/^\d$/.test(e.key)) push(e.key);
      else if (e.key === 'Backspace') setPin((p) => p.slice(0, -1));
      else if (e.key === 'Enter' && pin.length >= 4) onDone(pin);
    };
    window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h);
  });
  return (
    <div>
      <h2>{title}</h2>
      <div className="tl-dots" aria-label={t('PIN')}>{[0, 1, 2, 3, 4, 5].map((i) => <span key={i} className={i < pin.length ? 'on' : ''} />)}</div>
      <div className="tl-pad">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => <button key={d} onClick={() => push(d)}>{d}</button>)}
        <button onClick={() => setPin('')} aria-label={t('Clear')}>C</button>
        <button onClick={() => push('0')}>0</button>
        <button className="go" disabled={pin.length < 4} onClick={() => onDone(pin)}>{t('OK')}</button>
      </div>
      {onCancel && <button className="tl-link" onClick={onCancel}>{t('Cancel')}</button>}
    </div>
  );
}

function SignIn() {
  const { cfg } = useStore();
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <div className="tl-center"><div className="tl-card">
      <div className="tl-top"><strong>{cfg!.storeName} · {cfg!.tillName}</strong><LangSwitch /></div>
      <AccentPicker />
      {err && <p role="alert" className="tl-err">{err}</p>}
      <PinPad title={busy ? t('Signing in…') : t('Enter your PIN')} onDone={async (pin) => {
        setBusy(true); setErr('');
        try { await S.signIn(pin); } catch (e) { setErr(errText(e)); } finally { setBusy(false); }
      }} />
      <button className="tl-link" onClick={() => { if (confirm(t('Choose a different register on this device?'))) S.resetSetup(); }}>{t('Change register')}</button>
    </div></div>
  );
}

function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  useEffect(() => { const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose(); window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h); }, [onClose]);
  return (
    <div className="tl-modal" role="dialog" aria-modal="true" aria-label={title} onClick={onClose}>
      <div className={'tl-sheet' + (wide ? ' wide' : '')} onClick={(e) => e.stopPropagation()}>
        <div className="tl-top"><h2>{title}</h2><button className="tl-x" onClick={onClose} aria-label={t('Close')}>×</button></div>
        {children}
      </div>
    </div>
  );
}

function ReceiptView({ sale, onDone }: { sale: Sale; onDone: () => void }) {
  const { cfg, lbpRate } = useStore();
  return (
    <Modal title={t('Sale complete')} onClose={onDone}>
      <div id="tl-receipt" className="tl-receipt">
        <h3>Nabd</h3>
        <p>{cfg!.storeName} · {cfg!.tillName}</p>
        <p>{t('Receipt')} {sale.receiptNo}<br />{new Date(sale.soldAt).toLocaleString()}<br />{sale.display.cashier}</p>
        <hr />
        {sale.display.customer && <p>{t('Customer')}: {sale.display.customer}</p>}
        {sale.display.lines.map((l, i) => <div key={i}><div className="r"><span>{l.qty} × {l.name}</span><span>{usd(l.qty * l.unit)}</span></div>{l.off > 0 && <div className="r"><span>&nbsp;&nbsp;{t('Discount')}</span><span>-{usd(l.off)}</span></div>}</div>)}
        {sale.display.promoNames.map((n) => <div key={n} className="r"><span>★ {n}</span></div>)}
        <hr />
        <div className="r"><span>{t('Subtotal')}</span><span>{usd(sale.display.subtotal)}</span></div>
        {sale.discountCents > 0 && <div className="r"><span>{t('Discount')}</span><span>-{usd(sale.discountCents)}</span></div>}
        {sale.display.pointsOff > 0 && <div className="r"><span>{t('Points')}</span><span>-{usd(sale.display.pointsOff)}</span></div>}
        <div className="r"><span>{t('VAT')}</span><span>{usd(sale.display.vat)}</span></div>
        <div className="r b"><span>{t('Total')}</span><span>{usd(sale.display.total)}</span></div>
        <div className="r"><span>{t('LBP')}</span><span>{lbp(sale.display.total, sale.lbpRate || lbpRate)}</span></div>
        <div className="r"><span>{t('Paid by')}</span><span>{sale.tender === 'account' ? t('On account') : sale.tender.toUpperCase()}</span></div>
        {sale.display.earned > 0 && <div className="r"><span>{t('Points earned')}</span><span>+{sale.display.earned}</span></div>}
      </div>
      <div className="tl-row"><button className="tl-btn" onClick={() => window.print()}>{t('Print receipt')}</button><button className="tl-btn primary" onClick={onDone} autoFocus>{t('New sale')}</button></div>
    </Modal>
  );
}

function Pay({ onClose, onDone }: { onClose: () => void; onDone: (s: Sale) => void }) {
  const st = useStore();
  const tot = S.currentTotals();
  const [tender, setTender] = useState<Sale['tender']>('usd');
  const [given, setGiven] = useState('');
  const due = tender === 'lbp' ? Math.round(tot.total * st.lbpRate / 100) : tot.total;
  const givenN: number | null = tender === 'usd' ? parseUsdToCents(given) : Number(given.replace(/[^\d]/g, '')) || 0;
  const change = tender === 'usd' ? (givenN ?? 0) - tot.total : tender === 'lbp' ? (givenN ?? 0) - due : 0;
  const c = st.customer;
  const room = c ? (c.creditLimitCents ?? 0) - (c.balanceCents ?? 0) : 0;
  const acctOk = !!c && tot.total <= room;
  const ok = tender === 'account' ? acctOk : tender === 'card' || (givenN !== null && change >= 0 && given !== '');
  return (
    <Modal title={t('Payment')} onClose={onClose}>
      <p className="tl-big">{usd(tot.total)} <small>{lbp(tot.total, st.lbpRate)}</small></p>
      <div className="tl-row" role="tablist">
        {(['usd', 'lbp', 'card', 'account'] as const).map((k) => <button key={k} role="tab" aria-selected={tender === k} className={'tl-btn' + (tender === k ? ' primary' : '')} onClick={() => { setTender(k); setGiven(''); }}>{k === 'usd' ? 'USD' : k === 'lbp' ? 'LBP' : k === 'card' ? t('Card') : t('On account')}</button>)}
      </div>
      {tender === 'account' && (c ? <p className={acctOk ? 'tl-ok' : 'tl-err'}>{c.name}: {t('Available credit')} {usd(Math.max(0, room))}{!acctOk && ' — ' + t('over the limit')}</p> : <p className="tl-err">{t('Choose a customer first.')}</p>)}
      {tender !== 'card' && tender !== 'account' && <label>{t('Cash received')} {tender === 'lbp' && <small>({due.toLocaleString()} LBP)</small>}
        <input autoFocus inputMode="decimal" value={given} onChange={(e) => setGiven(e.target.value)} /></label>}
      {tender !== 'card' && tender !== 'account' && given !== '' && <p className={change >= 0 ? 'tl-ok' : 'tl-err'}>{change >= 0 ? t('Change') : t('Short by')}: {tender === 'usd' ? usd(Math.abs(change)) : Math.abs(change).toLocaleString('en-US') + ' LBP'}</p>}
      <button className="tl-btn primary full" disabled={!ok} onClick={() => onDone(S.completeSale(tender))}>{t('Complete sale')}</button>
    </Modal>
  );
}

function CustomerPicker({ onClose }: { onClose: () => void }) {
  const st = useStore();
  const [q, setQ] = useState('');
  const [list, setList] = useState<Customer[]>([]);
  const [err, setErr] = useState('');
  const [nw, setNw] = useState({ name: '', phone: '' });
  const [pay, setPay] = useState('');
  const run = async () => { setErr(''); try { setList(await S.searchCustomers(q)); } catch { setErr(t('Customers need a connection to the server.')); } };
  useEffect(() => { void run(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const pick = (c: Customer) => { S.setCustomer(c); onClose(); };
  const add = async () => { if (!nw.name.trim()) return; try { pick(await S.createCustomer(nw)); } catch (e) { setErr(errText(e)); } };
  const c = st.customer;
  const receive = async () => {
    const amt = parseUsdToCents(pay); if (!c || !amt) return;
    try { const u = await S.takePayment(c.id, amt, 'cash'); S.setCustomer(u); setPay(''); } catch (e) { setErr(errText(e)); }
  };
  return (
    <Modal title={t('Customer')} onClose={onClose} wide>
      {err && <p role="alert" className="tl-err">{err}</p>}
      {c && <div className="tl-ok"><b>{c.name}</b> · {t('Points')}: {c.points} · {t('Balance')}: {usd(c.balanceCents ?? 0)}
        <div className="tl-row"><input aria-label={t('Payment')} placeholder={t('Payment on account')} value={pay} onChange={(e) => setPay(e.target.value)} /><button className="tl-btn sm" onClick={receive}>{t('Receive')}</button><button className="tl-btn sm" onClick={() => { S.setCustomer(null); }}>{t('Remove')}</button></div></div>}
      <div className="tl-row"><input aria-label={t('Search')} placeholder={t('Name or phone')} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && run()} autoFocus /><button className="tl-btn" onClick={run}>{t('Find')}</button></div>
      <div className="tl-list">{list.map((x) => <button key={x.id} className="tl-btn" onClick={() => pick(x)}>{x.name} · {x.phone ?? ''} · {x.points} {t('pts')}</button>)}</div>
      <div className="tl-row"><input aria-label={t('Name')} placeholder={t('New customer name')} value={nw.name} onChange={(e) => setNw({ ...nw, name: e.target.value })} /><input aria-label={t('Phone')} placeholder={t('Phone')} value={nw.phone} onChange={(e) => setNw({ ...nw, phone: e.target.value })} /><button className="tl-btn primary" onClick={add}>{t('Add')}</button></div>
    </Modal>
  );
}

function Returns({ onClose }: { onClose: () => void }) {
  const [no, setNo] = useState('');
  const [sale, setSale] = useState<SaleLookup | null>(null);
  const [qty, setQty] = useState<Record<string, number>>({});
  const [reason, setReason] = useState('');
  const [pin, setPin] = useState('');
  const [needPin, setNeedPin] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const find = async () => { setErr(''); setMsg(''); try { setSale(await S.lookupSale(no)); setQty({}); } catch (e) { setSale(null); setErr(errText(e)); } };
  const submit = async () => {
    if (!sale) return; setErr('');
    const lines = Object.entries(qty).filter(([, q]) => q > 0).map(([productId, q]) => ({ productId, qty: q }));
    try {
      const cents = await S.submitReturn({ saleId: sale.id, tender: sale.tender, lines, reason, approverPin: pin || undefined });
      setMsg(t('Refund {amount} on {tender}.', { amount: usd(cents), tender: sale.tender.toUpperCase() })); setSale(null); setNo(''); setPin(''); setNeedPin(false);
    } catch (e) {
      const text = errText(e);
      if (/supervisor|approv|pin/i.test(String((e as Error).message))) setNeedPin(true);
      setErr(text);
    }
  };
  return (
    <Modal title={t('Return')} onClose={onClose} wide>
      {msg && <p role="status" className="tl-ok">{msg}</p>}
      {err && <p role="alert" className="tl-err">{err}</p>}
      <div className="tl-row"><input aria-label={t('Receipt number')} placeholder={t('Receipt number')} value={no} onChange={(e) => setNo(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && find()} autoFocus />
        <button className="tl-btn" onClick={find}>{t('Find')}</button></div>
      {sale && <>
        <table className="tl-table"><thead><tr><th>{t('Item')}</th><th>{t('Sold')}</th><th>{t('Returnable')}</th><th>{t('Return')}</th></tr></thead><tbody>
          {sale.lines.map((l) => <tr key={l.productId}><td>{l.name}</td><td>{l.sold}</td><td>{l.returnable}</td>
            <td><input type="number" min={0} max={l.returnable} aria-label={l.name} value={qty[l.productId] ?? 0} onChange={(e) => setQty({ ...qty, [l.productId]: Math.min(l.returnable, Math.max(0, Number(e.target.value) || 0)) })} /></td></tr>)}
        </tbody></table>
        <label>{t('Reason')}<input value={reason} onChange={(e) => setReason(e.target.value)} /></label>
        {needPin && <label>{t('Supervisor PIN')}<input type="password" inputMode="numeric" value={pin} onChange={(e) => setPin(e.target.value)} /></label>}
        <button className="tl-btn primary full" disabled={!Object.values(qty).some((q) => q > 0)} onClick={submit}>{t('Refund')}</button>
      </>}
    </Modal>
  );
}

function Shift({ onClose }: { onClose: () => void }) {
  const { shift } = useStore();
  const [float, setFloat] = useState('0');
  const [cnt, setCnt] = useState({ usd: '', lbp: '', card: '' });
  const [note, setNote] = useState('');
  const [err, setErr] = useState('');
  const [result, setResult] = useState('');
  useEffect(() => { S.loadShift().catch((e) => setErr(errText(e))); }, []);
  const run = async (fn: () => Promise<void>) => { setErr(''); try { await fn(); } catch (e) { setErr(errText(e)); } };
  return (
    <Modal title={t('Shift')} onClose={onClose}>
      {err && <p role="alert" className="tl-err">{err}</p>}
      {result && <p role="status" className="tl-ok">{result}</p>}
      {!shift && !result && <>
        <label>{t('Opening cash (USD)')}<input inputMode="decimal" value={float} onChange={(e) => setFloat(e.target.value)} /></label>
        <button className="tl-btn primary full" onClick={() => run(async () => { await S.openShift(parseUsdToCents(float) ?? 0); onClose(); })}>{t('Open shift')}</button>
      </>}
      {shift && <>
        <p>{t('Open since')} {new Date(shift.openedAt).toLocaleTimeString()}. {t('Count the drawer and enter what is there.')}</p>
        <label>USD<input inputMode="decimal" value={cnt.usd} onChange={(e) => setCnt({ ...cnt, usd: e.target.value })} /></label>
        <label>LBP<input inputMode="numeric" value={cnt.lbp} onChange={(e) => setCnt({ ...cnt, lbp: e.target.value })} /></label>
        <label>{t('Card slips total (USD)')}<input inputMode="decimal" value={cnt.card} onChange={(e) => setCnt({ ...cnt, card: e.target.value })} /></label>
        <label>{t('Note (needed if anything differs)')}<input value={note} onChange={(e) => setNote(e.target.value)} /></label>
        <button className="tl-btn primary full" onClick={() => run(async () => {
          const r = await S.closeShift({ usdCents: parseUsdToCents(cnt.usd || '0') ?? 0, lbp: Number(cnt.lbp.replace(/[^\d]/g, '')) || 0, cardCents: parseUsdToCents(cnt.card || '0') ?? 0, note });
          const d = r.difference;
          setResult(d.usdCents === 0 && d.lbp === 0 && d.cardCents === 0 ? t('Shift closed. The drawer matches.') : t('Shift closed. Difference: USD {u}, LBP {l}, card {c}.', { u: usd(d.usdCents), l: d.lbp.toLocaleString(), c: usd(d.cardCents) }));
        })}>{t('Close shift')}</button>
      </>}
    </Modal>
  );
}

function Register() {
  const st = useStore();
  const [q, setQ] = useState('');
  const [modal, setModal] = useState<null | 'pay' | 'returns' | 'shift' | 'cust'>(null);
  const [receipt, setReceipt] = useState<Sale | null>(null);
  const [note, setNote] = useState('');
  const search = useRef<HTMLInputElement>(null);
  useEffect(() => S.start(), []);
  useEffect(() => { search.current?.focus(); }, [modal, receipt]);
  const tot = S.currentTotals();
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (s ? st.products.filter((p) => p.name.toLowerCase().includes(s) || (p.barcode ?? '').includes(s)) : st.products).slice(0, 60);
  }, [q, st.products]);
  const scan = () => {
    const code = q.trim(); if (!code) return;
    const hit = st.products.find((p) => p.barcode === code) ?? (list.length === 1 ? list[0] : undefined);
    if (hit) { S.addProduct(hit); setQ(''); setNote(''); } else setNote(t('No product matches "{q}".', { q: code }));
  };
  const waiting = st.queue.length;
  return (
    <div className="tl-app">
      <header className="tl-bar">
        <strong>{st.cfg!.storeName} · {st.cfg!.tillName}</strong>
        <span className={'tl-pill ' + (st.online ? 'ok' : 'off')}>{st.online ? t('Online') : t('Offline')}{waiting > 0 && ` · ${t('{n} waiting', { n: waiting })}`}</span>
        {st.rejected.length > 0 && <span className="tl-pill off" title={st.rejected.map((r) => `${r.receiptNo}: ${r.reason}`).join('\n')}>{t('{n} rejected', { n: st.rejected.length })}</span>}
        <span className="tl-grow" />
        <button className="tl-btn sm" onClick={() => setModal('cust')}>{st.customer ? st.customer.name : t('Customer')}</button>
        <button className="tl-btn sm" onClick={() => setModal('returns')}>{t('Return')}</button>
        <button className="tl-btn sm" onClick={() => setModal('shift')}>{t('Shift')}</button>
        <LangSwitch style={{ color: '#C9D4D0' }} />
        <AccentPicker light />
        <button className="tl-btn sm" onClick={S.signOut}>{st.me?.name} · {t('Sign out')}</button>
      </header>
      <main className="tl-main">
        <section className="tl-products" aria-label={t('Products')}>
          <input ref={search} className="tl-search" aria-label={t('Search or scan a barcode')} placeholder={t('Search or scan a barcode')} value={q} onChange={(e) => { setQ(e.target.value); setNote(''); }} onKeyDown={(e) => e.key === 'Enter' && scan()} />
          {note && <p role="alert" className="tl-err">{note}</p>}
          {st.syncMessage && <p role="status" className="tl-err">{st.syncMessage}</p>}
          <div className="tl-grid">
            {list.map((p: Product) => <button key={p.id} className="tl-tile" onClick={() => S.addProduct(p)}>
              {p.image ? <img src={p.image} alt="" loading="lazy" /> : <span className="tl-ph" aria-hidden="true">{iconFor(p.name)}</span>}
              <span>{p.name}</span><b>{usd(p.priceCents)}</b></button>)}
            {list.length === 0 && <p>{st.products.length === 0 ? t('No products loaded yet. Connect to the server once.') : t('Nothing found.')}</p>}
          </div>
        </section>
        <aside className="tl-cart" aria-label={t('Cart')}>
          <div className="tl-lines">
            {st.cart.length === 0 && <p className="tl-sub">{t('Scan or tap a product to start.')}</p>}
            {st.cart.map((l, i) => (
              <div key={l.product.id} className="tl-line">
                <span className="n">{l.product.name}
                  <select className="tl-ld" aria-label={t('Line discount')} value={l.discountPct} onChange={(e) => { const m = S.setLineDiscount(l.product.id, Number(e.target.value)); setNote(m ? t(m) : ''); }}>{[0, 5, 10, 15, 20].map((d) => <option key={d} value={d}>{d}%</option>)}</select>
                  {tot.lines[i]!.promo > 0 && <small className="tl-promo"> ★ -{usd(tot.lines[i]!.promo)}</small>}</span>
                <span className="q"><button onClick={() => S.changeQty(l.product.id, -1)} aria-label={t('Less')}>−</button><b>{l.qty}</b><button onClick={() => S.changeQty(l.product.id, 1)} aria-label={t('More')}>+</button></span>
                <span className="p">{usd(l.product.priceCents * l.qty - tot.lines[i]!.promo - tot.lines[i]!.manual)}</span>
              </div>
            ))}
          </div>
          <div className="tl-sum">
            <div className="r"><span>{t('Subtotal')}</span><span>{usd(tot.subtotal)}</span></div>
            <div className="r"><span>{t('Discount')}
              <select aria-label={t('Discount')} value={st.discountPct} onChange={(e) => { const m = S.setDiscount(Number(e.target.value)); setNote(m ? t(m) : ''); }}>{[0, 5, 10, 15, 20].map((d) => <option key={d} value={d}>{d}%</option>)}</select></span><span>-{usd(tot.orderManual)}</span></div>
            {tot.lineOff > 0 && <div className="r"><span>{t('Line & promo discounts')}{tot.promoNames.length > 0 && <small> ★ {tot.promoNames.join(', ')}</small>}</span><span>-{usd(tot.lineOff)}</span></div>}
            {st.customer && st.loyalty.enabled && <div className="r"><span>{t('Points')} ({st.customer.points})
              <input className="tl-pts" type="number" min={0} max={Math.min(st.customer.points, tot.maxRedeem)} aria-label={t('Redeem points')} value={st.redeem} onChange={(e) => S.setRedeem(Math.min(Number(e.target.value) || 0, st.customer!.points, tot.maxRedeem))} /></span><span>-{usd(tot.pointsOff)}</span></div>}
            {st.customer && tot.earned > 0 && <div className="r sub"><span>{t('Points earned')}</span><span>+{tot.earned}</span></div>}
            <div className="r"><span>{t('VAT')}</span><span>{usd(tot.vat)}</span></div>
            <div className="r tot"><span>{t('Total')}</span><span>{usd(tot.total)}</span></div>
            <div className="r sub"><span>{t('LBP')}</span><span>{lbp(tot.total, st.lbpRate)}</span></div>
            <div className="tl-row"><button className="tl-btn" disabled={!st.cart.length} onClick={S.clearCart}>{t('Clear')}</button>
              <button className="tl-btn primary grow" disabled={!st.cart.length} onClick={() => setModal('pay')}>{t('Pay')} {usd(tot.total)}</button></div>
          </div>
        </aside>
      </main>
      {modal === 'pay' && <Pay onClose={() => setModal(null)} onDone={(s) => { setModal(null); setReceipt(s); }} />}
      {modal === 'cust' && <CustomerPicker onClose={() => setModal(null)} />}
      {modal === 'returns' && <Returns onClose={() => setModal(null)} />}
      {modal === 'shift' && <Shift onClose={() => setModal(null)} />}
      {receipt && <ReceiptView sale={receipt} onDone={() => setReceipt(null)} />}
    </div>
  );
}

export function Till() {
  const st = useStore();
  if (!st.cfg) return <Setup />;
  if (!st.token || !st.me) return <SignIn />;
  return <Register />;
}

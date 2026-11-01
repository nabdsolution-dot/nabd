import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { PageHeader } from '../components/Layout';
import { Banner, Field, Loading, LoadError, Pill } from '../components/ui';
import { useLoad } from '../useLoad';
import { useAuth } from '../auth';
import { api, type Category, type Product } from '../api';
import { lbp, parseUsdToCents, usd } from '../format';
import { errText, t } from '../i18n';

/** Crops to a square and shrinks to 192 px, so a phone photo becomes about 10 KB. */
async function shrinkImage(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((ok, bad) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => bad(new Error('bad image')); i.src = url; });
    const side = Math.min(img.naturalWidth, img.naturalHeight);
    const c = document.createElement('canvas'); c.width = 192; c.height = 192;
    const g = c.getContext('2d');
    if (!g) throw new Error('no canvas');
    g.fillStyle = '#fff'; g.fillRect(0, 0, 192, 192);
    g.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, 192, 192);
    return c.toDataURL('image/jpeg', 0.72);
  } finally { URL.revokeObjectURL(url); }
}

interface List { items: Product[]; total: number; page: number; limit: number }
const LIMIT = 10;

export function Products() {
  const { can } = useAuth();
  const canProducts = can('manage_products');
  const canPrices = can('manage_prices');
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [cat, setCat] = useState('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Product | 'new' | null>(null);

  useEffect(() => { const timer = setTimeout(() => { setDebounced(search); setPage(1); }, 250); return () => clearTimeout(timer); }, [search]);

  const qs = useMemo(() => {
    const p = new URLSearchParams({ page: String(page), limit: String(LIMIT) });
    if (debounced) p.set('search', debounced);
    if (cat) p.set('categoryId', cat);
    return '/products?' + p.toString();
  }, [page, debounced, cat]);

  const list = useLoad<List>(qs);
  const cats = useLoad<Category[]>('/categories');
  const rate = useLoad<{ lbpRate: number }>('/settings');
  const pages = Math.max(1, Math.ceil((list.data?.total ?? 0) / LIMIT));

  return (
    <>
      <PageHeader title={t('Products')} sub={list.data ? t('{n} products', { n: list.data.total }) : undefined}
        actions={canProducts ? <button className="btn btn-primary" onClick={() => setSelected('new')}>{t('Add product')}</button> : undefined} />
      <main className="content">
        <div className="split">
          <section className="card" style={{ flex: '2 1 560px', minWidth: 0 }} aria-label={t('Product list')}>
            <div className="toolbar">
              <div style={{ flex: '1 1 220px' }}>
                <label htmlFor="search" className="sr-only">{t('Search products')}</label>
                <input id="search" className="input" type="search" placeholder={t('Search name or barcode')} value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
              <button className={'chip' + (cat === '' ? ' on' : '')} onClick={() => { setCat(''); setPage(1); }}>{t('All')}</button>
              {cats.data?.map((c) => (
                <button key={c.id} className={'chip' + (cat === c.id ? ' on' : '')} onClick={() => { setCat(c.id); setPage(1); }}>{c.name}</button>
              ))}
            </div>
            {list.loading && !list.data && <Loading what="products" />}
            {list.error && <LoadError message={list.error} retry={list.reload} />}
            {list.data && (
              <>
                <div className="table-wrap">
                  <table>
                    <thead><tr><th>{t('Product')}</th><th>{t('Barcode')}</th><th>{t('Category')}</th><th className="num">{t('Price')}</th><th className="num">{t('Stock')}</th></tr></thead>
                    <tbody>
                      {list.data.items.length === 0 && <tr><td colSpan={5} className="muted">{t('No product matches. Check the spelling or clear the filters.')}</td></tr>}
                      {list.data.items.map((p) => (
                        <tr key={p.id} className={'selectable' + (selected !== 'new' && selected?.id === p.id ? ' selected' : '')} onClick={() => setSelected(p)}>
                          <td className="strong"><button className="btn-ghost" style={{ all: 'unset', cursor: 'pointer', fontWeight: 600 }} onClick={() => setSelected(p)}>{p.image ? <img className="thumb" src={p.image} alt="" /> : <span className="thumb thumb-ph" aria-hidden="true">{p.name.slice(0, 1).toUpperCase()}</span>}{p.name}</button>{!p.active && <> <Pill kind="neutral">{t('Inactive')}</Pill></>}</td>
                          <td className="muted num" style={{ textAlign: 'start' }} dir="ltr">{p.barcode}</td>
                          <td className="muted">{p.category}</td>
                          <td className="num">{usd(p.priceCents)}</td>
                          <td className="num"><Pill kind={p.reorderLevel > 0 && p.stock <= p.reorderLevel ? 'warn' : 'ok'}>{p.stock}</Pill></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="pager">
                  <span>{t('Showing {n} of {total}', { n: list.data.items.length, total: list.data.total })}</span>
                  <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <button className="btn" disabled={page <= 1} onClick={() => setPage(page - 1)}>{t('Previous')}</button>
                    <span>{t('Page {p} of {n}', { p: page, n: pages })}</span>
                    <button className="btn" disabled={page >= pages} onClick={() => setPage(page + 1)}>{t('Next')}</button>
                  </span>
                </div>
              </>
            )}
          </section>
          {selected && (
            <ProductPanel key={selected === 'new' ? 'new' : selected.id} product={selected === 'new' ? null : selected}
              categories={cats.data ?? []} rate={rate.data?.lbpRate ?? 89500} canProducts={canProducts} canPrices={canPrices}
              onClose={() => setSelected(null)}
              onSaved={(p) => { setSelected(p); list.reload(); }} />
          )}
        </div>
      </main>
    </>
  );
}

function ProductPanel({ product, categories, rate, canProducts, canPrices, onClose, onSaved }: {
  product: Product | null; categories: Category[]; rate: number; canProducts: boolean; canPrices: boolean;
  onClose: () => void; onSaved: (p: Product) => void;
}) {
  const [name, setName] = useState(product?.name ?? '');
  const [barcode, setBarcode] = useState(product?.barcode ?? '');
  const [categoryId, setCategoryId] = useState(product?.categoryId ?? '');
  const [price, setPrice] = useState(product ? (product.priceCents / 100).toFixed(2) : '');
  const [vat, setVat] = useState(product ? String(product.vatBp / 100) : '11');
  const [reorder, setReorder] = useState(product ? String(product.reorderLevel) : '0');
  const [active, setActive] = useState(product?.active ?? true);
  const [image, setImage] = useState<string | null>(product?.image ?? null);
  const [imgErr, setImgErr] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [fieldErr, setFieldErr] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  const priceCents = parseUsdToCents(price);
  const priceOnly = !canProducts && canPrices;
  const readOnly = !canProducts && !canPrices;

  async function save(e: FormEvent) {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!priceOnly && !name.trim()) errs.name = t('Enter a name.');
    if (priceCents === null) errs.price = t('Enter a price like 2.50.');
    const vatNum = Number(vat);
    if (!priceOnly && (Number.isNaN(vatNum) || vatNum < 0 || vatNum > 100)) errs.vat = t('VAT must be between 0 and 100.');
    const reorderNum = Number(reorder);
    if (!priceOnly && (!Number.isInteger(reorderNum) || reorderNum < 0)) errs.reorder = t('Use a whole number.');
    setFieldErr(errs); setSaved(false); setError(null);
    if (Object.keys(errs).length) return;
    setBusy(true);
    try {
      const body = priceOnly ? { priceCents } : {
        name: name.trim(), barcode: barcode.trim() || null, categoryId: categoryId || null,
        priceCents, vatBp: Math.round(vatNum * 100), reorderLevel: reorderNum, active, image
      };
      const p = product
        ? await api<Product>('PATCH', '/products/' + product.id, body)
        : await api<Product>('POST', '/products', body);
      setSaved(true);
      onSaved(p);
    } catch (err) {
      setError(errText(err));
    } finally { setBusy(false); }
  }

  return (
    <aside className="card panel" aria-label={product ? t('Edit product') : t('Add product')}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
        <div><h2 style={{ margin: 0, fontSize: 20 }}>{product ? product.name : t('New product')}</h2>
          {product && <span className="muted" style={{ fontSize: 14 }}>{product.category ?? t('No category')}{product.barcode ? t(', barcode {code}', { code: product.barcode }) : ''}</span>}</div>
        <button className="btn btn-ghost" style={{ height: 36, padding: '0 8px' }} onClick={onClose} aria-label={t('Close panel')}>{t('Close')}</button>
      </div>
      <form onSubmit={save} style={{ display: 'flex', flexDirection: 'column', gap: 16 }} noValidate>
        {error && <Banner kind="error">{error}</Banner>}
        {saved && <Banner kind="success">{t('Saved. Tills pick this up on their next sync.')}</Banner>}
        <Field id="p-name" label={t('Name')} error={fieldErr.name}><input id="p-name" className="input" value={name} onChange={(e) => setName(e.target.value)} disabled={priceOnly || readOnly} /></Field>
        <div className="pic">
          {image ? <img src={image} alt={t('Product picture')} /> : <span className="pic-ph" aria-hidden="true">{(name || '?').slice(0, 1).toUpperCase()}</span>}
          {!priceOnly && !readOnly && (
            <div style={{ display: 'grid', gap: 6 }}>
              <label className="btn" style={{ display: 'inline-flex', alignItems: 'center', cursor: 'pointer', height: 40 }}>
                {image ? t('Change picture') : t('Add picture')}
                <input type="file" accept="image/*" className="sr-only" onChange={async (e) => {
                  const f = e.target.files?.[0]; e.target.value = '';
                  if (!f) return;
                  setImgErr('');
                  try { setImage(await shrinkImage(f)); } catch { setImgErr(t('That file could not be used as a picture.')); }
                }} />
              </label>
              {image && <button type="button" className="btn btn-ghost" style={{ height: 32, padding: 0, textAlign: 'start' }} onClick={() => setImage(null)}>{t('Remove picture')}</button>}
              {imgErr && <span className="hint" role="alert">{imgErr}</span>}
            </div>
          )}
        </div>
        <div className="fields">
          <Field id="p-barcode" label={t('Barcode')}><input id="p-barcode" className="input" value={barcode} onChange={(e) => setBarcode(e.target.value)} disabled={priceOnly || readOnly} /></Field>
          <Field id="p-cat" label={t('Category')}>
            <select id="p-cat" className="select" value={categoryId} onChange={(e) => setCategoryId(e.target.value)} disabled={priceOnly || readOnly}>
              <option value="">{t('No category')}</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
        </div>
        <div className="fields">
          <Field id="p-price" label={t('Price, USD')} error={fieldErr.price}><input id="p-price" className="input num" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} disabled={readOnly || (!canPrices && !!product)} /></Field>
          <div className="field"><label>{t('Price, LBP')}</label><div className="input" style={{ display: 'flex', alignItems: 'center', background: '#F7F9F8', color: 'var(--slate)' }}>{priceCents !== null ? lbp(priceCents, rate) : '—'}</div><span className="hint">{t('From the rate of {rate}', { rate: rate.toLocaleString('en-US') })}</span></div>
        </div>
        <div className="fields">
          <Field id="p-vat" label={t('VAT, %')} error={fieldErr.vat}><input id="p-vat" className="input num" inputMode="decimal" value={vat} onChange={(e) => setVat(e.target.value)} disabled={priceOnly || readOnly} /></Field>
          <Field id="p-reorder" label={t('Reorder level')} error={fieldErr.reorder}><input id="p-reorder" className="input num" inputMode="numeric" value={reorder} onChange={(e) => setReorder(e.target.value)} disabled={priceOnly || readOnly} /></Field>
        </div>
        <label style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: 15 }}>
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} disabled={priceOnly || readOnly} style={{ width: 20, height: 20 }} /> {t('Active, can be sold')}
        </label>
        <div className="note">{t('A price change reaches every till on its next sync. Tills that are offline keep the old price until they reconnect.')}</div>
        {!readOnly && (
          <div className="fields">
            <button className="btn btn-primary" type="submit" disabled={busy} style={{ flex: '1 1 120px', height: 48 }}>{busy ? t('Saving…') : product ? t('Save changes') : t('Add product')}</button>
            <button className="btn" type="button" onClick={onClose} style={{ flex: '1 1 120px', height: 48 }}>{t('Discard')}</button>
          </div>
        )}
      </form>
    </aside>
  );
}

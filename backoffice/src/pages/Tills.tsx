import { useState, type FormEvent } from 'react';
import { PageHeader } from '../components/Layout';
import { Banner, Loading, LoadError, Pill } from '../components/ui';
import { useLoad } from '../useLoad';
import { useAuth } from '../auth';
import { api, type StoreRow, type TillRow } from '../api';
import { timeAgo, usd } from '../format';
import { errText, t } from '../i18n';

export function Tills() {
  const { can } = useAuth();
  const stores = useLoad<StoreRow[]>('/stores');
  const tills = useLoad<TillRow[]>('/tills');
  const [adding, setAdding] = useState(false);
  const [storeId, setStoreId] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function add(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api('POST', '/tills', { storeId: storeId || stores.data?.[0]?.id, name });
      setName(''); setAdding(false); tills.reload(); stores.reload();
    } catch (err) { setError(errText(err)); }
  }

  const total = tills.data?.length ?? 0;
  const online = tills.data?.filter((x) => x.online).length ?? 0;

  return (
    <>
      <PageHeader title={t('Stores and tills')} sub={tills.data ? t('{stores} stores, {tills} tills, {online} online', { stores: stores.data?.length ?? 0, tills: total, online }) : undefined}
        actions={can('manage_tills') ? <button className="btn btn-primary" onClick={() => setAdding(!adding)}>{t('Register a till')}</button> : undefined} />
      <main className="content">
        {adding && (
          <form className="card card-pad" onSubmit={add} style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 520 }}>
            <h2>{t('Register a till')}</h2>
            {error && <Banner kind="error">{error}</Banner>}
            <div className="fields">
              <div className="field"><label htmlFor="t-store">{t('Store')}</label>
                <select id="t-store" className="select" value={storeId || stores.data?.[0]?.id || ''} onChange={(e) => setStoreId(e.target.value)}>
                  {stores.data?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select></div>
              <div className="field"><label htmlFor="t-name">{t('Till name')}</label><input id="t-name" className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Register 4" required /></div>
            </div>
            <div className="fields"><button className="btn btn-primary" type="submit">{t('Register')}</button><button className="btn" type="button" onClick={() => setAdding(false)}>{t('Cancel')}</button></div>
          </form>
        )}
        {stores.error && <div className="card"><LoadError message={stores.error} retry={stores.reload} /></div>}
        <div className="stores">
          {stores.data?.map((s) => (
            <div className="card store" key={s.id}>
              <div className="name"><span>{s.name}</span><Pill kind={s.tillsOnline === s.tills ? 'ok' : 'warn'}>{s.tillsOnline === s.tills ? t('All online') : t('{n} not reporting', { n: s.tills - s.tillsOnline })}</Pill></div>
              <span className="muted" style={{ fontSize: 14 }}>{t('{online} of {tills} tills online, {waiting} sales waiting', { online: s.tillsOnline, tills: s.tills, waiting: s.waiting })}</span>
              <span className="big">{usd(s.salesTodayCents)}</span>
            </div>
          ))}
        </div>
        <section className="card" aria-label={t('Tills')}>
          <div className="card-head"><h2>{t('Tills')}</h2></div>
          {tills.loading && !tills.data && <Loading what="tills" />}
          {tills.error && <LoadError message={tills.error} retry={tills.reload} />}
          {tills.data && (
            <div className="table-wrap">
              <table>
                <thead><tr><th>{t('Till')}</th><th>{t('Store')}</th><th>{t('Status')}</th><th className="num">{t('Waiting to upload')}</th><th>{t('Last sync')}</th><th>{t('App')}</th><th>{t('Cashier app')}</th></tr></thead>
                <tbody>
                  {tills.data.map((r) => (
                    <tr key={r.id}>
                      <td className="strong">{r.name}</td><td className="muted">{r.store}</td>
                      <td><Pill kind={r.online ? 'ok' : 'warn'}>{r.online ? t('Online') : r.lastSyncAt ? t('Offline since {when}', { when: timeAgo(r.lastSyncAt) }) : t('Not connected yet')}</Pill></td>
                      <td className="num">{r.queuedSales}</td><td className="muted">{timeAgo(r.lastSyncAt)}</td><td className="muted">{r.appVersion ?? '—'}</td>
                      <td><button className="btn" type="button" onClick={() => { void navigator.clipboard?.writeText(`Store ID: ${r.storeId}\nTill ID: ${r.id}`); }}>{t('Copy setup')}</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </>
  );
}

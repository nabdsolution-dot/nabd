import { PageHeader } from '../components/Layout';
import { Loading, LoadError, Pill } from '../components/ui';
import { useLoad } from '../useLoad';
import { pctText, usd } from '../format';
import type { Dashboard as D } from '../api';
import { t } from '../i18n';

export function Dashboard() {
  const { data, error, loading, reload } = useLoad<D>('/dashboard');
  const hours = Array.from({ length: 12 }, (_, i) => i + 8);
  const byHour = new Map((data?.hourly ?? []).map((h) => [h.hour, h.cents]));
  const max = Math.max(1, ...hours.map((h) => byHour.get(h) ?? 0));

  return (
    <>
      <PageHeader title={t('Dashboard')} sub={t('All stores, today')} />
      <main className="content">
        {loading && !data && <div className="card"><Loading what="the dashboard" /></div>}
        {error && <div className="card"><LoadError message={error} retry={reload} /></div>}
        {data && (
          <>
            <div className="kpis">
              <div className="card kpi"><span className="label">{t('Sales today')}</span><span className="value">{usd(data.salesCents)}</span><Delta p={data.salesVsLastWeekPct} /></div>
              <div className="card kpi"><span className="label">{t('Transactions')}</span><span className="value">{data.transactions}</span><Delta p={data.transactionsVsLastWeekPct} /></div>
              <div className="card kpi"><span className="label">{t('Average basket')}</span><span className="value">{usd(data.averageBasketCents)}</span><span className="delta muted" style={{ color: 'var(--slate)' }}>{t('Sales divided by transactions')}</span></div>
              <div className="card kpi"><span className="label">{t('Tills online')}</span><span className="value">{t('{n} of {m}', { n: data.tillsOnline, m: data.tillsTotal })}</span>
                <span className={'delta' + (data.tillsOnline < data.tillsTotal ? ' warn' : '')}>{data.tillsTotal - data.tillsOnline === 0 ? t('All tills reporting') : t('{n} not reporting', { n: data.tillsTotal - data.tillsOnline })}</span></div>
            </div>
            <div className="row">
              <section className="card card-pad grow2" aria-label={t('Sales by hour')}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}><h2>{t('Sales by hour')}</h2><span className="muted" style={{ fontSize: 14 }}>{t('USD, all stores')}</span></div>
                <div className="bars">
                  {hours.map((h) => {
                    const c = byHour.get(h) ?? 0;
                    return (
                      <div className="bar-col" key={h}>
                        <span className="bar-label">{c ? Math.round(c / 100) : ''}</span>
                        <div className={'bar' + (c === max && c > 0 ? ' peak' : '')} style={{ height: Math.round((c / max) * 150) + 'px' }} />
                        <span className="bar-label">{String(h).padStart(2, '0')}</span>
                      </div>
                    );
                  })}
                </div>
              </section>
              <section className="card card-pad grow1" aria-label={t('Needs attention')}>
                <h2>{t('Needs attention')}</h2>
                {data.alerts.length === 0 && <p className="muted">{t('Nothing needs attention right now.')}</p>}
                {data.alerts.map((a, i) => (
                  <div className="alert warn" key={i}><span className="dot" aria-hidden="true" /><div><div className="alert-title">{a.title}</div><div className="alert-body">{a.body}</div></div></div>
                ))}
              </section>
            </div>
            <section className="card" aria-label={t('Top products today')}>
              <div className="card-head"><h2>{t('Top products today')}</h2></div>
              <div className="table-wrap">
                <table>
                  <thead><tr><th>{t('Product')}</th><th>{t('Category')}</th><th className="num">{t('Units')}</th><th className="num">{t('Sales')}</th></tr></thead>
                  <tbody>
                    {data.top.length === 0 && <tr><td colSpan={4} className="muted">{t('No sales yet today.')}</td></tr>}
                    {data.top.map((row) => (
                      <tr key={row.name}><td className="strong">{row.name}</td><td className="muted">{row.category}</td><td className="num">{row.units}</td><td className="num strong">{usd(row.salesCents)}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}
      </main>
    </>
  );
}

function Delta({ p }: { p: number | null }) {
  const d = pctText(p, 'last week');
  return <span className={'delta' + (d.good ? '' : ' warn')}>{d.text}</span>;
}
export { Pill };

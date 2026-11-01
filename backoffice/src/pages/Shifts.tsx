import { PageHeader } from '../components/Layout';
import { Loading, LoadError, Pill } from '../components/ui';
import { useLoad } from '../useLoad';
import { timeAgo, usd } from '../format';
import type { ShiftRow } from '../api';
import { t } from '../i18n';

function diffText(expected: number | null, counted: number | null, kind: 'usd' | 'lbp'): string {
  if (expected === null || counted === null) return '';
  const d = counted - expected;
  if (d === 0) return t('Matches');
  const sign = d > 0 ? '+' : '-';
  return kind === 'usd' ? sign + usd(Math.abs(d)).replace('-', '') : sign + Math.abs(d).toLocaleString('en-US') + ' LBP';
}

export function Shifts() {
  const shifts = useLoad<ShiftRow[]>('/shifts');
  return (
    <>
      <PageHeader title={t('Shifts')} sub={t('Drawer counts compared with what the sales say should be there')} />
      <main className="content">
        <section className="card" aria-label={t('Shifts')}>
          {shifts.loading && !shifts.data && <Loading what="shifts" />}
          {shifts.error && <LoadError message={shifts.error} retry={shifts.reload} />}
          {shifts.data && shifts.data.length === 0 && <p className="muted card-pad">{t('No shifts yet.')}</p>}
          {shifts.data && shifts.data.length > 0 && (
            <div className="table-wrap">
              <table>
                <thead><tr><th>{t('Cashier')}</th><th>{t('Till')}</th><th>{t('Opened')}</th><th>{t('Status')}</th><th>{t('Cash, USD')}</th><th>{t('Cash, LBP')}</th><th>{t('Note')}</th></tr></thead>
                <tbody>
                  {shifts.data.map((s) => (
                    <tr key={s.id}>
                      <td className="strong">{s.cashier}</td>
                      <td className="muted">{s.till}, {s.store}</td>
                      <td className="muted">{timeAgo(s.openedAt)}</td>
                      <td>{!s.closed ? <Pill kind="neutral">{t('Open')}</Pill> : s.matches ? <Pill kind="ok">{t('Matches')}</Pill> : <Pill kind="warn">{t('Needs review')}</Pill>}</td>
                      <td>{diffText(s.expectedUsdCents, s.countedUsdCents, 'usd')}</td>
                      <td>{diffText(s.expectedLbp, s.countedLbp, 'lbp')}</td>
                      <td className="muted">{s.note ?? ''}</td>
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

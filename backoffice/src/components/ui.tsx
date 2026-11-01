import type { ReactNode } from 'react';
import { t } from '../i18n';

export function Pill({ kind, children }: { kind: 'ok' | 'warn' | 'bad' | 'neutral'; children: ReactNode }) {
  return <span className={'pill ' + kind}>{children}</span>;
}

export function Banner({ kind, children }: { kind: 'error' | 'success'; children: ReactNode }) {
  return <div className={'banner ' + kind} role={kind === 'error' ? 'alert' : 'status'}>{children}</div>;
}

export function Field({ id, label, hint, error, children }: { id: string; label: string; hint?: string; error?: string; children: ReactNode }) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {children}
      {hint && !error && <span className="hint">{hint}</span>}
      {error && <span className="err">{error}</span>}
    </div>
  );
}

export function Loading({ what }: { what: string }) {
  return <div className="empty" role="status">{t('Loading {what}…', { what: t(what) })}</div>;
}

export function LoadError({ message, retry }: { message: string; retry: () => void }) {
  return (
    <div className="empty" role="alert">
      <div className="strong" style={{ color: 'var(--alert)' }}>{t(message)}</div>
      <button className="btn" style={{ marginTop: 12 }} onClick={retry}>{t('Try again')}</button>
    </div>
  );
}

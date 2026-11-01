import { useState, type FormEvent } from 'react';
import { useAuth } from '../auth';
import { Banner, Field } from '../components/ui';
import { LangSwitch, errText, t } from '../i18n';

export function Login() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    try { await signIn(email, password); } catch (err) { setError(errText(err)); } finally { setBusy(false); }
  }

  return (
    <div className="center-screen">
      <form className="card login" onSubmit={submit}>
        <div className="brand" style={{ padding: 0 }}><span className="brand-mark" aria-hidden="true">N</span><span className="brand-name" style={{ color: 'var(--ink)' }}>Nabd</span></div>
        <h1>{t('Sign in to the back office')}</h1>
        {error && <Banner kind="error">{error}</Banner>}
        <Field id="email" label={t('Email')}><input id="email" className="input" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required /></Field>
        <Field id="password" label={t('Password')}><input id="password" className="input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required /></Field>
        <button className="btn btn-primary" type="submit" disabled={busy}>{busy ? t('Signing in…') : t('Sign in')}</button>
        <LangSwitch style={{ alignSelf: 'center' }} />
      </form>
    </div>
  );
}

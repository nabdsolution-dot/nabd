import { useState, type FormEvent } from 'react';
import { PageHeader } from '../components/Layout';
import { Banner, Field, Loading, LoadError, Pill } from '../components/ui';
import { useLoad } from '../useLoad';
import { api, type RolesResponse, type StoreRow, type UserRow } from '../api';
import { timeAgo } from '../format';
import { errText, t } from '../i18n';

export function Users() {
  const roles = useLoad<RolesResponse>('/roles');
  const users = useLoad<UserRow[]>('/users');
  const stores = useLoad<StoreRow[]>('/stores');
  const [inviting, setInviting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [f, setF] = useState({ name: '', email: '', roleId: 'cashier', storeId: '', password: '', pin: '' });

  const needsEmail = f.roleId !== 'cashier';

  async function invite(e: FormEvent) {
    e.preventDefault(); setError(null);
    try {
      await api('POST', '/users', {
        name: f.name, roleId: f.roleId, storeId: f.storeId || null,
        ...(needsEmail ? { email: f.email, password: f.password } : { pin: f.pin })
      });
      setInviting(false); setF({ name: '', email: '', roleId: 'cashier', storeId: '', password: '', pin: '' }); users.reload();
    } catch (err) { setError(errText(err)); }
  }

  async function toggle(u: UserRow) {
    setError(null);
    try { await api('PATCH', '/users/' + u.id, { active: !u.active }); users.reload(); }
    catch (err) { setError(errText(err)); }
  }

  return (
    <>
      <PageHeader title={t('Users and roles')} sub={users.data && roles.data ? t('{users} users, {roles} roles', { users: users.data.length, roles: roles.data.roles.length }) : undefined}
        actions={<button className="btn btn-primary" onClick={() => setInviting(!inviting)}>{t('Invite user')}</button>} />
      <main className="content">
        {error && <Banner kind="error">{error}</Banner>}
        {inviting && (
          <form className="card card-pad" onSubmit={invite} style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 560 }}>
            <h2>{t('Invite a user')}</h2>
            <Field id="u-name" label={t('Name')}><input id="u-name" className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required /></Field>
            <div className="fields">
              <Field id="u-role" label={t('Role')}><select id="u-role" className="select" value={f.roleId} onChange={(e) => setF({ ...f, roleId: e.target.value })}>
                {roles.data?.roles.map((r) => <option key={r.id} value={r.id}>{t(r.name)}</option>)}</select></Field>
              <Field id="u-store" label={t('Store')}><select id="u-store" className="select" value={f.storeId} onChange={(e) => setF({ ...f, storeId: e.target.value })}>
                <option value="">{t('All stores')}</option>{stores.data?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
            </div>
            {needsEmail ? (
              <div className="fields">
                <Field id="u-email" label={t('Email')}><input id="u-email" className="input" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} required /></Field>
                <Field id="u-pass" label={t('Password')} hint={t('At least 8 characters')}><input id="u-pass" className="input" type="password" minLength={8} value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} required /></Field>
              </div>
            ) : (
              <Field id="u-pin" label={t('PIN')} hint={t('4 to 6 digits, used at the till')}><input id="u-pin" className="input" inputMode="numeric" pattern="\d{4,6}" value={f.pin} onChange={(e) => setF({ ...f, pin: e.target.value })} required /></Field>
            )}
            <div className="fields"><button className="btn btn-primary" type="submit">{t('Invite')}</button><button className="btn" type="button" onClick={() => setInviting(false)}>{t('Cancel')}</button></div>
          </form>
        )}
        <section className="card" aria-label={t('What each role can do')}>
          <div className="card-head"><h2>{t('What each role can do')}</h2></div>
          {roles.loading && !roles.data && <Loading what="roles" />}
          {roles.error && <LoadError message={roles.error} retry={roles.reload} />}
          {roles.data && (
            <div className="table-wrap">
              <table>
                <thead><tr><th>{t('Permission')}</th>{roles.data.roles.map((r) => <th key={r.id} style={{ textAlign: 'center' }}>{t(r.name)}</th>)}</tr></thead>
                <tbody>
                  {roles.data.permissions.map((p) => (
                    <tr key={p.permission}><td className="strong">{t(p.label)}</td>
                      {roles.data!.roles.map((r) => {
                        const a = p.access[r.id];
                        return <td key={r.id} style={{ textAlign: 'center' }}><Pill kind={a === 'yes' ? 'ok' : a === 'pin' ? 'warn' : 'neutral'}>{a === 'yes' ? t('Yes') : a === 'pin' ? t('With PIN') : t('No')}</Pill></td>;
                      })}</tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
        <section className="card" aria-label={t('Users')}>
          <div className="card-head"><h2>{t('Users')}</h2></div>
          {users.loading && !users.data && <Loading what="users" />}
          {users.error && <LoadError message={users.error} retry={users.reload} />}
          {users.data && (
            <div className="table-wrap">
              <table>
                <thead><tr><th>{t('Name')}</th><th>{t('Role')}</th><th>{t('Store')}</th><th>{t('Sign-in')}</th><th>{t('Last active')}</th><th /></tr></thead>
                <tbody>
                  {users.data.map((u) => (
                    <tr key={u.id}>
                      <td className="strong">{u.name}{!u.active && <> <Pill kind="neutral">{t('Inactive')}</Pill></>}</td><td>{t(u.role)}</td><td className="muted">{u.store}</td>
                      <td className="muted">{u.signin}</td><td className="muted">{timeAgo(u.lastActiveAt)}</td>
                      <td style={{ textAlign: 'end' }}><button className="btn" style={{ height: 36 }} onClick={() => toggle(u)}>{u.active ? t('Deactivate') : t('Activate')}</button></td>
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

import { NavLink, Outlet } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAuth } from '../auth';
import { LangSwitch, t } from '../i18n';
import { AccentPicker } from '../accent';

const icons: Record<string, ReactNode> = {
  dashboard: <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="7" height="9" rx="1" /><rect x="14" y="3" width="7" height="5" rx="1" /><rect x="14" y="12" width="7" height="9" rx="1" /><rect x="3" y="16" width="7" height="5" rx="1" /></svg>,
  products: <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 8l-9-5-9 5 9 5z" /><path d="M3 8v8l9 5 9-5V8" /></svg>,
  tills: <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="12" rx="2" /><path d="M8 20h8M12 16v4" /></svg>,
  shifts: <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5" /><path d="M12 7v5l3 2" /></svg>,
  users: <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0" /><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14.5a6.5 6.5 0 0 1 3.5 5.5" /></svg>
};

export function Layout() {
  const { me, can, signOut } = useAuth();
  const items = [
    { to: '/', label: t('Dashboard'), icon: 'dashboard', show: can('view_reports'), end: true },
    { to: '/products', label: t('Products'), icon: 'products', show: can('view_reports', 'manage_products', 'manage_prices') },
    { to: '/tills', label: t('Stores and tills'), icon: 'tills', show: can('view_reports', 'manage_tills') },
    { to: '/shifts', label: t('Shifts'), icon: 'shifts', show: can('view_reports') },
    { to: '/users', label: t('Users and roles'), icon: 'users', show: can('manage_users') }
  ].filter((i) => i.show);

  return (
    <div className="shell">
      <nav className="sidebar" aria-label={t('Back office')}>
        <div className="brand"><span className="brand-mark" aria-hidden="true">N</span><span className="brand-name">Nabd</span></div>
        {items.map((i) => (
          <NavLink key={i.to} to={i.to} end={i.end} className={({ isActive }) => 'nav-link' + (isActive ? ' active' : '')}>
            {icons[i.icon]}{i.label}
          </NavLink>
        ))}
        <div className="sidebar-foot">
          <span>{me?.name}</span>
          <button className="btn btn-ghost" style={{ color: '#C9D4D0', height: 36, padding: 0, textAlign: 'start' }} onClick={signOut}>{t('Sign out')}</button>
          <LangSwitch style={{ color: '#C9D4D0', height: 36, padding: 0, textAlign: 'start' }} />
          <AccentPicker light />
        </div>
      </nav>
      <div className="main-col"><Outlet /></div>
    </div>
  );
}

export function PageHeader({ title, sub, actions }: { title: string; sub?: string; actions?: ReactNode }) {
  return (
    <header className="topbar">
      <div><h1>{title}</h1>{sub && <div className="sub">{sub}</div>}</div>
      <div className="topbar-actions">{actions}</div>
    </header>
  );
}

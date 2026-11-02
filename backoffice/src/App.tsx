import { BrowserRouter, HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth';
import { Layout } from './components/Layout';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { Products } from './pages/Products';
import { Tills } from './pages/Tills';
import { Users } from './pages/Users';
import { Shifts } from './pages/Shifts';
import { Customers } from './pages/Customers';
import { Promotions } from './pages/Promotions';
import { Till } from './till/Till';
import { LangProvider, t } from './i18n';

function Gate() {
  const { me, loading, can } = useAuth();
  if (loading) return <div className="center-screen" role="status">{t('Loading…')}</div>;
  if (!me) return <Login />;
  const home = can('view_reports') ? '/' : can('manage_products', 'manage_prices') ? '/products' : '/tills';
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={can('view_reports') ? <Dashboard /> : <Navigate to={home} replace />} />
        <Route path="products" element={<Products />} />
        <Route path="tills" element={<Tills />} />
        <Route path="shifts" element={can('view_reports') ? <Shifts /> : <Navigate to={home} replace />} />
        <Route path="customers" element={can('manage_customers') ? <Customers /> : <Navigate to={home} replace />} />
        <Route path="promotions" element={can('manage_promotions') ? <Promotions /> : <Navigate to={home} replace />} />
        <Route path="users" element={can('manage_users') ? <Users /> : <Navigate to={home} replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

// The hosted preview has no server routes, so it builds with VITE_HASH_ROUTER=1.
const Router = import.meta.env.VITE_HASH_ROUTER ? HashRouter : BrowserRouter;

export default function App() {
  return (
    <LangProvider><Router>
      <Routes>
        <Route path="/till" element={<Till />} />
        <Route path="*" element={<AuthProvider><Gate /></AuthProvider>} />
      </Routes>
    </Router></LangProvider>
  );
}

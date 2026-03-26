import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './hooks/useAuth';
import { AuthGuard, RoleGuard } from './components/AuthGuard';
import { Layout } from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Pointage from './pages/Pointage';
import Historique from './pages/Historique';
import Analytics from './pages/Analytics';
import Admin from './pages/Admin';

export default function App() {
  return (
    <AuthProvider>
      <Router>
        <Routes>
          <Route path="/login" element={<Login />} />
          
          <Route element={<AuthGuard />}>
            <Route element={<Layout><Dashboard /></Layout>} path="/" />
            
            <Route element={<RoleGuard allowedRoles={['super_admin', 'admin_rh', 'superviseur']} />}>
              <Route element={<Layout><Pointage /></Layout>} path="/pointage" />
            </Route>

            <Route element={<RoleGuard allowedRoles={['super_admin', 'admin_rh', 'superviseur', 'worker']} />}>
              <Route element={<Layout><Historique /></Layout>} path="/historique" />
            </Route>

            <Route element={<RoleGuard allowedRoles={['super_admin', 'admin_rh', 'observateur']} />}>
              <Route element={<Layout><Analytics /></Layout>} path="/analytics" />
            </Route>

            <Route element={<RoleGuard allowedRoles={['super_admin', 'admin_rh']} />}>
              <Route element={<Layout><Admin /></Layout>} path="/admin" />
            </Route>
          </Route>
        </Routes>
      </Router>
    </AuthProvider>
  );
}

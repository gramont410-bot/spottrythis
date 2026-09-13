import React from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import { SpotProvider } from './context/SpotContext';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Guards from './pages/Guards';
import Sites from './pages/Sites';
import Clients from './pages/Clients';
import PatrolOperations from './pages/Routes';
import Schedules from './pages/Schedules';
import ClientSchedules from './pages/ClientSchedules';
import AdminLogs from './pages/AdminLogs';
import Incidents from './pages/Incidents';
import GuardTracking from './pages/GuardTracking';
import Analytics from './pages/Analytics';
import Reports from './pages/Reports';
import Profile from './pages/Profile';
import Settings from './pages/Settings';
import Devices from './pages/Devices';
import FaceVerify from './pages/FaceVerify';
import ClientPortal from './pages/ClientPortal';
import Checkpoints from './pages/Checkpoints';

function RoleRoute({ allowedRoles, children }) {
  const { role } = useAuth();
  return allowedRoles.includes(role) ? children : <Navigate to={role === 'client' ? '/client' : '/'} replace />;
}

class ClientRouteBoundary extends React.Component {
  state = { error: null };
  static getDerivedStateFromError(error) { return { error }; }
  render() {
    if (this.state.error) return <div className="flex min-h-screen items-center justify-center bg-[#0F172A] p-6 text-center"><div className="card-spot max-w-md"><h1 className="text-lg font-bold text-white">Client workspace could not load</h1><p className="mt-2 text-sm text-slate-400">Refresh the page or sign in again. Your client data has not been changed.</p><button className="btn-primary mt-5" onClick={() => window.location.reload()}>Reload workspace</button></div></div>;
    return this.props.children;
  }
}

const STAFF_ROLES = ['superadmin', 'admin'];

export default function App() {
  const { user, loading, role } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0F172A]">
        <div className="flex items-center gap-3 text-sm font-semibold text-blue-400">
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-blue-500/30 border-t-blue-500" />
          Initializing S.P.O.T Command Telemetry...
        </div>
      </div>
    );
  }

  if (!user) return <Login />;

  if (role === 'client') {
    return (
      <SpotProvider>
        <ClientRouteBoundary><Routes>
          <Route path="/client" element={<ClientPortal />} />
          <Route path="/client/schedules" element={<ClientSchedules />} />
          <Route path="*" element={<Navigate to="/client" replace />} />
        </Routes></ClientRouteBoundary>
      </SpotProvider>
    );
  }

  return (
    <SpotProvider>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/tracking" element={<RoleRoute allowedRoles={STAFF_ROLES}><GuardTracking /></RoleRoute>} />
        <Route path="/routes" element={<RoleRoute allowedRoles={STAFF_ROLES}><PatrolOperations /></RoleRoute>} />
        <Route path="/guards" element={<RoleRoute allowedRoles={STAFF_ROLES}><Guards /></RoleRoute>} />
        <Route path="/face-verify" element={<RoleRoute allowedRoles={STAFF_ROLES}><FaceVerify /></RoleRoute>} />
        <Route path="/sites" element={<RoleRoute allowedRoles={STAFF_ROLES}><Sites /></RoleRoute>} />
        <Route path="/checkpoints" element={<RoleRoute allowedRoles={['superadmin', 'admin']}><Checkpoints /></RoleRoute>} />
        <Route path="/clients" element={<RoleRoute allowedRoles={['superadmin', 'admin']}><Clients /></RoleRoute>} />
        <Route path="/schedules" element={<RoleRoute allowedRoles={STAFF_ROLES}><Schedules /></RoleRoute>} />
        <Route path="/incidents" element={<RoleRoute allowedRoles={STAFF_ROLES}><Incidents /></RoleRoute>} />
        <Route path="/analytics" element={<RoleRoute allowedRoles={STAFF_ROLES}><Analytics /></RoleRoute>} />
        <Route path="/reports" element={<RoleRoute allowedRoles={STAFF_ROLES}><Reports /></RoleRoute>} />
        <Route path="/logs" element={<RoleRoute allowedRoles={['superadmin']}><AdminLogs /></RoleRoute>} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/settings" element={<RoleRoute allowedRoles={['superadmin']}><Settings /></RoleRoute>} />
        <Route path="/devices" element={<RoleRoute allowedRoles={['superadmin', 'admin']}><Devices /></RoleRoute>} />
        <Route path="/client" element={<Navigate to="/" replace />} />
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </SpotProvider>
  );
}

import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { dashboardPathFor } from '../../utils/constants';
import { PageLoader } from './Spinner';

/** Gate a route by login (and optionally role). Wrong role -> own dashboard; logged out -> /login. */
export default function ProtectedRoute({ roles, children }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <PageLoader label="Checking your session…" />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  if (roles && !roles.includes(user.role)) return <Navigate to={dashboardPathFor(user.role)} replace />;
  return children;
}

/** For /login and /register: logged-in users go straight to their dashboard. */
export function PublicOnlyRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <PageLoader label="Loading…" />;
  if (user) return <Navigate to={dashboardPathFor(user.role)} replace />;
  return children;
}

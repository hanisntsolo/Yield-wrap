import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Icon from '../components/common/Icon';
import { dashboardPathFor } from '../utils/constants';

export default function NotFound() {
  const { user } = useAuth();
  return (
    <div className="container-page flex min-h-[60vh] flex-col items-center justify-center py-16 text-center">
      <p className="metric text-6xl text-primary sm:text-7xl">404</p>
      <h1 className="mt-4 text-2xl font-extrabold">This page went to waste</h1>
      <p className="mt-2 max-w-md text-sm text-slate-500">
        We could not find what you were looking for. Unlike surplus food, this page cannot be redistributed.
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <Link to="/" className="btn btn-secondary">
          <Icon name="chevron-left" size={16} /> Home
        </Link>
        {user ? (
          <Link to={dashboardPathFor(user.role)} className="btn btn-primary">
            <Icon name="grid" size={16} /> My dashboard
          </Link>
        ) : null}
      </div>
    </div>
  );
}

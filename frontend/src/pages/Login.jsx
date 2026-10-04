import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import AuthLayout from '../components/auth/AuthLayout';
import Icon from '../components/common/Icon';
import Spinner from '../components/common/Spinner';
import { errorMessage, fieldErrors } from '../services/api';
import { dashboardPathFor } from '../utils/constants';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    const next = {};
    if (!email.trim()) next.email = 'Enter your email';
    if (!password) next.password = 'Enter your password';
    setErrors(next);
    if (Object.keys(next).length) return;
    setBusy(true);
    try {
      const user = await login(email.trim(), password);
      toast.success(`Welcome back${user?.name ? `, ${user.name.split(' ')[0]}` : ''}!`);
      const from = location.state?.from;
      const home = dashboardPathFor(user?.role);
      // Only honour the "from" path when it belongs to this role (or is role-agnostic).
      const target = from && (from.startsWith(home) || ['/notifications', '/profile', '/advertising', '/print'].some((p) => from.startsWith(p))) ? from : home;
      navigate(target, { replace: true });
    } catch (err) {
      setErrors(fieldErrors(err));
      toast.error(errorMessage(err, 'Could not log you in'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout title="Welcome back" subtitle="Log in to continue redistributing surplus food.">
      <form onSubmit={submit} className="space-y-4" noValidate>
        <div>
          <label htmlFor="login-email" className="label">
            Email
          </label>
          <input
            id="login-email"
            type="email"
            autoComplete="email"
            className={`input ${errors.email ? 'input-error' : ''}`}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.org"
          />
          {errors.email ? <p className="field-error">{errors.email}</p> : null}
        </div>
        <div>
          <label htmlFor="login-password" className="label">
            Password
          </label>
          <div className="relative">
            <input
              id="login-password"
              type={show ? 'text' : 'password'}
              autoComplete="current-password"
              className={`input pr-11 ${errors.password ? 'input-error' : ''}`}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button
              type="button"
              className="absolute right-1 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"
              onClick={() => setShow((s) => !s)}
              aria-label={show ? 'Hide password' : 'Show password'}
            >
              <Icon name={show ? 'eye' : 'lock'} size={17} />
            </button>
          </div>
          {errors.password ? <p className="field-error">{errors.password}</p> : null}
        </div>
        <button type="submit" className="btn btn-primary w-full" disabled={busy}>
          {busy ? <Spinner size={16} /> : <Icon name="arrow-right" size={16} />} Log in
        </button>
      </form>
      <p className="mt-6 text-center text-sm text-slate-500">
        New to YIELD WRAP?{' '}
        <Link to="/register" className="font-semibold text-primary hover:underline">
          Create an account
        </Link>
      </p>
    </AuthLayout>
  );
}

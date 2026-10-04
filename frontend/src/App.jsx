import { lazy, Suspense, useEffect } from 'react';
import { Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider } from './context/AuthContext';
import { NotificationProvider } from './context/NotificationContext';
import Navbar from './components/Navbar';
import ProtectedRoute, { PublicOnlyRoute } from './components/common/ProtectedRoute';
import { PageLoader } from './components/common/Spinner';
import Landing from './pages/Landing';
import NotFound from './pages/NotFound';

const Login = lazy(() => import('./pages/Login'));
const Register = lazy(() => import('./pages/Register'));
const DonorDashboard = lazy(() => import('./pages/DonorDashboard'));
const NGODashboard = lazy(() => import('./pages/NGODashboard'));
const VolunteerDashboard = lazy(() => import('./pages/VolunteerDashboard'));
const AdminDashboard = lazy(() => import('./pages/AdminDashboard'));
const Notifications = lazy(() => import('./pages/Notifications'));
const Profile = lazy(() => import('./pages/Profile'));
const Advertising = lazy(() => import('./pages/Advertising'));
const StickerSheet = lazy(() => import('./pages/StickerSheet'));
const PosterPrint = lazy(() => import('./pages/PosterPrint'));

function ScrollToTop() {
  const { pathname, hash } = useLocation();
  useEffect(() => {
    if (hash) {
      const el = document.getElementById(hash.slice(1));
      if (el) {
        el.scrollIntoView({ behavior: 'smooth' });
        return;
      }
    }
    window.scrollTo(0, 0);
  }, [pathname, hash]);
  return null;
}

function Layout() {
  return (
    <div className="flex min-h-screen flex-col bg-surface">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[2000] focus:rounded-lg focus:bg-white focus:px-4 focus:py-2 focus:shadow">
        Skip to content
      </a>
      <Navbar />
      <main id="main" className="flex-1">
        <Suspense fallback={<PageLoader label="Loading page…" />}>
          <Outlet />
        </Suspense>
      </main>
    </div>
  );
}

function PrintLayout() {
  return (
    <div className="min-h-screen bg-white">
      <Suspense fallback={<PageLoader label="Preparing print view…" />}>
        <Outlet />
      </Suspense>
    </div>
  );
}

const guard = (roles, element) => <ProtectedRoute roles={roles}>{element}</ProtectedRoute>;

export default function App() {
  return (
    <AuthProvider>
      <NotificationProvider>
        <ScrollToTop />
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<Landing />} />
            <Route path="login" element={<PublicOnlyRoute><Login /></PublicOnlyRoute>} />
            <Route path="register" element={<PublicOnlyRoute><Register /></PublicOnlyRoute>} />
            <Route path="donor/*" element={guard(['donor'], <DonorDashboard />)} />
            <Route path="ngo/*" element={guard(['ngo'], <NGODashboard />)} />
            <Route path="volunteer/*" element={guard(['volunteer'], <VolunteerDashboard />)} />
            <Route path="admin/*" element={guard(['admin'], <AdminDashboard />)} />
            <Route path="business/*" element={guard(['business'], <Advertising />)} />
            <Route path="advertising/*" element={guard(['donor', 'business', 'admin'], <Advertising />)} />
            <Route path="notifications" element={guard(null, <Notifications />)} />
            <Route path="profile" element={guard(null, <Profile />)} />
            <Route path="*" element={<NotFound />} />
          </Route>
          {/* Print views: no navbar, no ads. */}
          <Route element={<PrintLayout />}>
            <Route path="print/stickers/:donationId" element={guard(null, <StickerSheet />)} />
            <Route path="print/poster/:campaignId" element={guard(null, <PosterPrint />)} />
          </Route>
        </Routes>
        <Toaster
          position="top-right"
          gutter={10}
          containerStyle={{ top: 76 }}
          toastOptions={{
            duration: 4000,
            style: { borderRadius: '14px', background: '#1C2833', color: '#fff', fontSize: '14px', maxWidth: '420px' },
            success: { iconTheme: { primary: '#2ECC71', secondary: '#fff' } },
            error: { duration: 6000, iconTheme: { primary: '#E74C3C', secondary: '#fff' } },
          }}
        />
      </NotificationProvider>
    </AuthProvider>
  );
}

import { useEffect, useRef } from 'react';
import { DataProvider, useData } from './context/DataContext';
import { ToastProvider, useToast } from './context/ToastContext';
import { initials } from './utils';
import { Router, pageFromPath, pathFor, useRouter, normalizePath } from './router';

import Sidebar from './components/Sidebar';
import TicketModal from './components/TicketModal';
import Landing from './pages/Landing';
import Login from './pages/Login';

import AdminDashboard from './pages/admin/AdminDashboard';
import Bookings from './pages/admin/Bookings';
import Schedules from './pages/admin/Schedules';
import Vessels from './pages/admin/Vessels';
import AdminRoutes from './pages/admin/RoutesPage';
import Passengers from './pages/admin/Passengers';
import Reports from './pages/admin/Reports';
import Settings from './pages/admin/Settings';

import PassengerDashboard from './pages/passenger/PassengerDashboard';
import Booking from './pages/passenger/Booking';
import MyBookings from './pages/passenger/MyBookings';
import PassengerRoutes from './pages/passenger/RoutesPage';
import Profile from './pages/passenger/Profile';

const pageTitles = {
  dashboard: 'Dashboard',
  bookings: 'Bookings',
  schedules: 'Schedules',
  vessels: 'Vessels',
  routes: 'Routes',
  passengers: 'Passengers',
  reports: 'Reports',
  settings: 'Settings',
  booking: 'Book a Trip',
  profile: 'My Profile',
};

const ADMIN_PAGES = new Set(['dashboard', 'bookings', 'schedules', 'vessels', 'routes', 'passengers', 'reports', 'settings']);
const PASSENGER_PAGES = new Set(['dashboard', 'booking', 'bookings', 'routes', 'profile']);

function AdminApp({ page, onNavigate }) {
  switch (page) {
    case 'bookings': return <Bookings onNavigate={onNavigate} />;
    case 'schedules': return <Schedules />;
    case 'vessels': return <Vessels />;
    case 'routes': return <AdminRoutes />;
    case 'passengers': return <Passengers />;
    case 'reports': return <Reports />;
    case 'settings': return <Settings />;
    default: return <AdminDashboard onNavigate={onNavigate} />;
  }
}

function PassengerApp({ page, onNavigate }) {
  switch (page) {
    case 'booking': return <Booking onNavigate={onNavigate} />;
    case 'bookings': return <MyBookings />;
    case 'routes': return <PassengerRoutes />;
    case 'profile': return <Profile />;
    default: return <PassengerDashboard onNavigate={onNavigate} />;
  }
}

function MainApp() {
  const { session, logout, bookings, activeTicketId, closeTicket } = useData();
  const { location, navigate } = useRouter();
  const showToast = useToast();

  const page = pageFromPath(session?.role, location) || 'dashboard';
  const allowed = session?.role === 'admin' ? ADMIN_PAGES : PASSENGER_PAGES;
  const activeTicket = bookings.find((b) => b.id === activeTicketId) || null;

  useEffect(() => {
    if (!session) return;
    const prefix = session.role === 'admin' ? '/admin' : '/passenger';
    const currentPage = pageFromPath(session.role, location);
    if (!currentPage || !allowed.has(currentPage)) navigate(prefix, { replace: true });
  }, [session, location, navigate, allowed]);

  function onNavigate(nextPage) {
    navigate(pathFor(session.role, nextPage));
  }

  function handleLogout() {
    logout();
    navigate('/', { replace: true });
  }

  return (
    <div className="app">
      <Sidebar role={session.role} page={page} onNavigate={onNavigate} onLogout={handleLogout} />
      <main>
        <header className="top">
          <div>
            <span className="eyebrow">MONTENEGRO LINES</span>
            <h2>{pageTitles[page] || 'Dashboard'}</h2>
          </div>
          <div className="top-actions">
            <button className="icon-btn" onClick={() => showToast('No new notifications')}>
              ♢<i></i>
            </button>
            <div className="user">
              <div>{initials(session.name)}</div>
              <span>
                <b>{session.name}</b>
                <small>{session.role === 'admin' ? 'Administrator' : 'Passenger'}</small>
              </span>
            </div>
          </div>
        </header>
        <div>
          {session.role === 'admin' ? (
            <AdminApp page={page} onNavigate={onNavigate} />
          ) : (
            <PassengerApp page={page} onNavigate={onNavigate} />
          )}
        </div>
      </main>
      {activeTicket && <TicketModal booking={activeTicket} onClose={closeTicket} />}
    </div>
  );
}

function NotFoundRedirect() {
  const { navigate } = useRouter();
  useEffect(() => navigate('/', { replace: true }), [navigate]);
  return null;
}

function Root() {
  const { session } = useData();
  const { location, navigate } = useRouter();
  const wasLoggedIn = useRef(false);

  useEffect(() => {
    if (session) {
      wasLoggedIn.current = true;
      const isLogin = location === '/login/admin' || location === '/login/passenger' || location === '/';
      if (isLogin) navigate(pathFor(session.role), { replace: true });
    } else if (wasLoggedIn.current) {
      wasLoggedIn.current = false;
      navigate('/', { replace: true });
    }
  }, [session, location, navigate]);

  if (session) return <MainApp />;

  const path = normalizePath(location);
  if (path === '/') return <Landing onSelectPortal={(portal) => navigate(`/login/${portal}`)} />;
  if (path === '/login/admin') return <Login portal="admin" onBack={() => navigate('/')} />;
  if (path === '/login/passenger') return <Login portal="passenger" onBack={() => navigate('/')} />;

  return <NotFoundRedirect />;
}

export default function App() {
  return (
    <DataProvider>
      <ToastProvider>
        <Router>
          <Root />
        </Router>
      </ToastProvider>
    </DataProvider>
  );
}

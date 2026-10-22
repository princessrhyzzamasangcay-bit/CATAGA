import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

const RouterContext = createContext(null);

export function normalizePath(path = '/') {
  const clean = String(path).split('?')[0].split('#')[0].replace(/\/+/g, '/').replace(/\/+$/, '');
  return clean || '/';
}

export function pathFor(role, page = 'dashboard') {
  if (role === 'admin') return page === 'dashboard' ? '/admin' : `/admin/${page}`;
  if (role === 'passenger') return page === 'dashboard' ? '/passenger' : `/passenger/${page}`;
  return '/';
}

export function pageFromPath(role, pathname) {
  const path = normalizePath(pathname);
  const prefix = role === 'admin' ? '/admin' : '/passenger';
  if (path === prefix) return 'dashboard';
  if (path.startsWith(`${prefix}/`)) return path.slice(prefix.length + 1) || 'dashboard';
  return null;
}

export function Router({ children }) {
  const [location, setLocation] = useState(() => normalizePath(window.location.pathname));

  useEffect(() => {
    const onPopState = () => setLocation(normalizePath(window.location.pathname));
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const navigate = useCallback((to, { replace = false } = {}) => {
    const next = normalizePath(to);
    const current = normalizePath(window.location.pathname);
    if (next === current) return;

    if (replace) {
      window.history.replaceState({}, '', next);
    } else {
      window.history.pushState({}, '', next);
    }

    setLocation(next);
    window.scrollTo?.({ top: 0, behavior: 'auto' });
  }, []);

  const value = useMemo(
    () => ({ location: normalizePath(location), navigate }),
    [location, navigate]
  );

  return <RouterContext.Provider value={value}>{children}</RouterContext.Provider>;
}

export function useRouter() {
  const router = useContext(RouterContext);
  if (!router) throw new Error('useRouter must be used inside Router');
  return router;
}

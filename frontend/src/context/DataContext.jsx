import { createContext, useContext, useEffect, useState } from 'react';
import { fareNum, routeLabel, routes as staticRoutes } from '../data/fleetData';
import { auth, googleProvider } from '../services/firebase';
import { API_BASE } from '../config';
import { signOut, signInWithPopup } from 'firebase/auth';
import {
  createBooking as backendCreateBooking,
  createPassengerProfile,
  findUserByEmail,
  getUserProfile,
  subscribeToBookings,
  updateBooking as backendUpdateBooking,
} from '../services/firestoreService';

const DataContext = createContext(null);

const KEYS = {
  admins: 'mt_admins',
  passengers: 'mt_passengers',
  bookings: 'mt_bookings',
  session: 'mt_session',
};

function load(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function save(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function genId(prefix) {
  return `${prefix}-${Date.now().toString().slice(-6)}`;
}

const DEFAULT_ADMIN = {
  id: 'adm-default',
  username: 'admin',
  password: 'admin123',
  name: 'Administrator',
};

const DEFAULT_PASSENGER = {
  id: 'pax-default',
  username: 'passenger',
  password: '1234',
  name: 'Passenger',
};

function sortBookings(records) {
  return [...records].sort((a, b) => {
    const aTime = a.createdAt?.seconds || 0;
    const bTime = b.createdAt?.seconds || 0;
    return bTime - aTime;
  });
}

export function DataProvider({ children }) {
  const [admins, setAdmins] = useState(() => {
    const stored = load(KEYS.admins, [DEFAULT_ADMIN]);
    const hasDefault = stored.some((a) => a.username === DEFAULT_ADMIN.username);
    return hasDefault ? stored : [DEFAULT_ADMIN, ...stored];
  });

  const [passengers, setPassengers] = useState(() => {
    const stored = load(KEYS.passengers, [DEFAULT_PASSENGER]);
    const hasDefault = stored.some((p) => p.username === DEFAULT_PASSENGER.username);
    return hasDefault ? stored : [DEFAULT_PASSENGER, ...stored];
  });

  const [bookings, setBookings] = useState(() => load(KEYS.bookings, []));
  const [session, setSession] = useState(() => load(KEYS.session, null));
  const [activeTicketId, setActiveTicketId] = useState(null);

  useEffect(() => save(KEYS.admins, admins), [admins]);
  useEffect(() => save(KEYS.passengers, passengers), [passengers]);

  useEffect(() => {
    if (!session) return undefined;

    let cancelled = false;

    const loadServerBookings = async () => {
      try {
        const query = session.role === 'admin'
          ? ''
          : `?userId=${encodeURIComponent(session.id || '')}`;
        const response = await fetch(`${API_BASE}/api/bookings${query}`);
        if (!response.ok) throw new Error('Could not load bookings from Express.');
        const records = await response.json();
        if (!cancelled) setBookings(sortBookings(records));
      } catch (error) {
        console.error('Express booking sync failed:', error);
      }
    };

    loadServerBookings();
    const poll = window.setInterval(loadServerBookings, 2500);

    let unsubscribe = () => {};
    if (session.uid && auth.currentUser) {
      unsubscribe = subscribeToBookings({
        role: session.role,
        onData: (records) => setBookings(sortBookings(records)),
        onError: (error) => console.error('Firestore booking sync failed:', error),
      });
    }

    return () => {
      cancelled = true;
      window.clearInterval(poll);
      unsubscribe();
    };
  }, [session?.id, session?.uid, session?.role]);

  useEffect(() => {
    if (session) save(KEYS.session, session);
    else localStorage.removeItem(KEYS.session);
  }, [session]);

  function login({ username, password }) {
    const u = username.trim().toLowerCase();

    const admin = admins.find(
      (a) => a.username.toLowerCase() === u && a.password === password
    );

    if (admin) {
      const sess = {
        role: 'admin',
        id: admin.id,
        username: admin.username,
        name: admin.name,
      };
      setSession(sess);
      return sess;
    }

    const passenger = passengers.find(
      (p) => p.username.toLowerCase() === u && p.password === password
    );

    if (passenger) {
      const sess = {
        role: 'passenger',
        id: passenger.id,
        username: passenger.username,
        name: passenger.name,
      };
      setSession(sess);
      return sess;
    }

    throw new Error('Invalid username or password.');
  }

  function registerPassenger({ name, username, password }) {
    const cleanName = String(name || '').trim();
    const u = username.trim().toLowerCase();

    if (!cleanName) throw new Error('Name is required.');
    if (!/^[a-z0-9._-]{3,20}$/.test(u)) {
      throw new Error('Username must be 3–20 characters (letters, numbers, . _ -).');
    }

    const taken =
      admins.some((a) => a.username.toLowerCase() === u) ||
      passengers.some((p) => p.username.toLowerCase() === u);

    if (taken) throw new Error('Username is already taken.');

    const newPassenger = {
      id: genId('pax'),
      username: u,
      password,
      name: cleanName,
    };

    setPassengers((prev) => [...prev, newPassenger]);

    const sess = {
      role: 'passenger',
      id: newPassenger.id,
      username: u,
      name: cleanName,
    };

    setSession(sess);
    return sess;
  }

  async function loginWithGoogle({ name, email, uid, portal }) {
    const normalizedEmail = String(email || '').trim().toLowerCase();

    if (!normalizedEmail || !uid) {
      throw new Error('Google did not return the required account information. Please try again.');
    }

    let profile = null;

    try {
      profile = await getUserProfile(uid);

      if (!profile) {
        profile = await findUserByEmail(normalizedEmail);
      }
    } catch (error) {
      console.error('Firestore role lookup failed:', error);
      throw new Error(
        'Could not read your account role from Firestore. Check Firebase configuration and Firestore Rules.'
      );
    }

    if (profile?.status && String(profile.status).toLowerCase() !== 'active') {
      throw new Error('Your account is inactive. Please contact an administrator.');
    }

    const role = String(profile?.user || '').toLowerCase();

    if (portal === 'admin' && role !== 'admin') {
      throw new Error(
        'This Google account is not registered as an Admin. Create USER/{Firebase UID} with user: "admin" and status: "active".'
      );
    }

    if (portal === 'passenger' && role === 'admin') {
      throw new Error('This Google account is registered as an Admin. Please use the Admin Portal.');
    }

    if (!profile) {
      if (portal === 'admin') {
        throw new Error(
          'No Admin profile was found for this Google account. Create USER/{Firebase UID} with user: "admin" and status: "active".'
        );
      }

      try {
        profile = await createPassengerProfile({
          uid,
          name: name || normalizedEmail.split('@')[0],
          email: normalizedEmail,
        });
      } catch (error) {
        console.error('Could not create USER profile:', error);
        throw new Error(
          'Google sign-in worked, but your Passenger profile could not be created in Firestore. Check Firestore Rules.'
        );
      }
    }

    const finalRole =
      String(profile.user || 'passenger').toLowerCase() === 'admin'
        ? 'admin'
        : 'passenger';

    let passenger = passengers.find(
      (p) => p.email && p.email.toLowerCase() === normalizedEmail
    );

    if (finalRole === 'passenger' && !passenger) {
      passenger = {
        id: `google-${uid}`,
        username: `google-${uid.slice(0, 8)}`,
        name: profile.name || name || normalizedEmail.split('@')[0],
        email: normalizedEmail,
        password: null,
        provider: 'google',
      };
      setPassengers((prev) => [...prev, passenger]);
    }

    const sess = {
      role: finalRole,
      id: finalRole === 'admin' ? `google-${uid}` : passenger.id,
      username: finalRole === 'admin' ? normalizedEmail : passenger.username,
      name: profile.name || name || normalizedEmail,
      email: normalizedEmail,
      provider: 'google',
      uid,
    };

    setSession(sess);
    return sess;
  }

  async function logout() {
    setSession(null);
    setActiveTicketId(null);

    try {
      await signOut(auth);
    } catch {
    }
  }

  async function createBooking({
    name,
    contact,
    route,
    date,
    schedule,
    scheduleKey,
    qty,
    accom,
    payment,
    vessel,
    seats,
    passengers: passengerDetails,
    fare,
    fareBreakdown,
    paid = false,
    status = 'Pending',
  }) {
    const r = staticRoutes.find((rt) => routeLabel(rt) === route);
    const breakdown = Array.isArray(fareBreakdown) ? fareBreakdown : [];
    const amount = breakdown.length
      ? Math.round(breakdown.reduce((sum, item) => sum + Number(item.finalFare ?? 0), 0) * 100) / 100
      : fareNum(fare ?? r?.fare) * qty;

    const newBooking = {
      id: 'MT-' + Date.now().toString().slice(-6),
      userId: session?.id || 'guest',
      uid: session?.uid || null,
      email: session?.email || null,
      name,
      contact,
      route,
      date,
      schedule,
      scheduleKey: scheduleKey || null,
      qty,
      accom,
      payment,
      vessel: vessel || r?.vessel || '',
      seats: seats || [],
      passengers: passengerDetails || [],
      fareBreakdown: fareBreakdown || [],
      amount,
      paid,
      status,
    };

    const response = await fetch(`${API_BASE}/api/bookings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newBooking),
    });

    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.success) {
      throw new Error(result.message || 'Express backend rejected the booking.');
    }

    const savedBooking = result.booking || newBooking;

    setBookings((prev) => [
      savedBooking,
      ...prev.filter((b) => b.id !== savedBooking.id),
    ]);

    if (session?.uid && auth.currentUser?.uid === session.uid) {
      backendCreateBooking(savedBooking).catch((error) => {
        console.error('Could not additionally save booking to Firestore:', error);
      });
    }

    return savedBooking;
  }

  async function updateBooking(id, changes) {
    if (!id) throw new Error('Booking ID is required.');

    const response = await fetch(
      `${API_BASE}/api/bookings/${encodeURIComponent(id)}`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(changes),
      }
    );

    const data = await response.json().catch(() => ({}));

    if (!response.ok || !data.success) {
      throw new Error(data.message || 'Booking update failed.');
    }

    const updatedBooking = data.booking;

    setBookings((prev) =>
      prev.map((booking) =>
        booking.id === id ? updatedBooking : booking
      )
    );

    // Keep the existing Firebase/Firestore data synchronized when available.
    if (session?.uid && auth.currentUser?.uid === session.uid) {
      backendUpdateBooking(id, changes).catch((error) => {
        console.error('Could not update Firestore booking:', error);
      });
    }

    return updatedBooking;
  }

  async function deleteBooking(id) {
    if (!id) throw new Error('Booking ID is required.');
    const response = await fetch(`${API_BASE}/api/bookings/${encodeURIComponent(id)}`, { method: 'DELETE' });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.success) throw new Error(data.message || 'Booking delete failed.');
    setBookings((prev) => prev.filter((booking) => booking.id !== id));
    console.log('BOOKING DELETED FROM SYSTEM:', { id });
    return data;
  }

  async function setBookingStatus(id, status) {
    try {
      await updateBooking(id, { status });
    } catch (error) {
      console.error('Could not update booking:', error);
      window.alert(error.message || 'Could not update booking.');
    }
  }

  function payBooking(id) {
    setBookings((prev) =>
      prev.map((b) =>
        b.id === id ? { ...b, paid: true, status: 'Confirmed' } : b
      )
    );
    setActiveTicketId(id);

    if (session?.uid && auth.currentUser?.uid === session.uid) {
      backendUpdateBooking(id, {
        paid: true,
        status: 'Confirmed',
      }).catch((error) => {
        console.error('Could not update payment:', error);
        setBookings((prev) =>
          prev.map((b) =>
            b.id === id ? { ...b, paid: false, status: 'Pending' } : b
          )
        );
        setActiveTicketId(null);
        window.alert(
          'Payment status could not be saved to the backend. Please try again.'
        );
      });
    }
  }

  function viewTicket(id) {
    setActiveTicketId(id);
  }

  function closeTicket() {
    setActiveTicketId(null);
  }

  const value = {
    admins,
    passengers,
    bookings,
    session,
    activeTicketId,
    login,
    registerPassenger,
    loginWithGoogle,
    logout,
    createBooking,
    updateBooking,
    deleteBooking,
    setBookingStatus,
    payBooking,
    viewTicket,
    closeTicket,
  };

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export async function signInWithGoogleAccount() {
  return signInWithPopup(auth, googleProvider);
}

export function useData() {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData must be used within a DataProvider');
  return ctx;
}

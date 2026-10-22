import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { auth, db } from './firebase';

const COLLECTIONS = {
  users: 'USER',
  bookings: 'BOOKINGS',
};

function requireFirebaseUser() {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('Firebase authentication is required for this backend operation.');
  }
  return user;
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function bookingId() {
  return `MT-${Date.now().toString(36).toUpperCase()}-${Math.random()
    .toString(36)
    .slice(2, 6)
    .toUpperCase()}`;
}

function cleanBooking(booking) {
  return {
    ...booking,
    id: booking.id || booking.docId,
    amount: Number(booking.amount || 0),
    qty: Number(booking.qty || 1),
    paid: Boolean(booking.paid),
  };
}

export async function getUserProfile(uid = auth.currentUser?.uid) {
  if (!uid) return null;
  const snap = await getDoc(doc(db, COLLECTIONS.users, uid));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function findUserByEmail(email) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) return null;

  const snap = await getDocs(
    query(collection(db, COLLECTIONS.users), where('email', '==', normalizedEmail))
  );

  const item = snap.docs[0];
  return item ? { id: item.id, ...item.data() } : null;
}

export async function createPassengerProfile({ uid, name, email }) {
  if (!uid) throw new Error('Missing Firebase user ID.');

  const normalizedEmail = normalizeEmail(email);
  const profile = {
    email: normalizedEmail,
    name: String(name || normalizedEmail.split('@')[0] || 'Passenger').trim(),
    status: 'active',
    user: 'passenger',
    provider: 'google',
    updatedAt: serverTimestamp(),
  };

  await setDoc(doc(db, COLLECTIONS.users, uid), profile, { merge: true });
  return { id: uid, ...profile };
}

export async function createBooking(booking) {
  const user = requireFirebaseUser();

  const id = booking.id || bookingId();
  const payload = {
    ...booking,
    id,
    uid: user.uid,
    userId: booking.userId || `google-${user.uid}`,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  await setDoc(doc(db, COLLECTIONS.bookings, id), payload);
  return cleanBooking(payload);
}

export async function getBookings({ role = 'passenger' } = {}) {
  const user = requireFirebaseUser();

  let q;
  if (role === 'admin') {
    q = query(collection(db, COLLECTIONS.bookings), orderBy('createdAt', 'desc'));
  } else {
    q = query(
      collection(db, COLLECTIONS.bookings),
      where('uid', '==', user.uid),
      orderBy('createdAt', 'desc')
    );
  }

  const snap = await getDocs(q);
  return snap.docs.map((item) => cleanBooking({ docId: item.id, ...item.data() }));
}

export function subscribeToBookings({ role = 'passenger', onData, onError } = {}) {
  const user = auth.currentUser;
  if (!user) return () => {};

  const q =
    role === 'admin'
      ? query(collection(db, COLLECTIONS.bookings), orderBy('createdAt', 'desc'))
      : query(
          collection(db, COLLECTIONS.bookings),
          where('uid', '==', user.uid),
          orderBy('createdAt', 'desc')
        );

  return onSnapshot(
    q,
    (snap) => {
      const records = snap.docs.map((item) =>
        cleanBooking({ docId: item.id, ...item.data() })
      );
      onData?.(records);
    },
    (error) => {
      console.error('Firestore booking subscription failed:', error);
      onError?.(error);
    }
  );
}

export async function updateBooking(id, changes) {
  requireFirebaseUser();

  if (!id) throw new Error('Booking ID is required.');

  const ref = doc(db, COLLECTIONS.bookings, id);
  await updateDoc(ref, {
    ...changes,
    updatedAt: serverTimestamp(),
  });

  const updated = await getDoc(ref);
  if (!updated.exists()) throw new Error('Booking no longer exists.');

  return cleanBooking({ docId: updated.id, ...updated.data() });
}

export async function getBooking(id) {
  if (!id) return null;
  const snap = await getDoc(doc(db, COLLECTIONS.bookings, id));
  return snap.exists() ? cleanBooking({ docId: snap.id, ...snap.data() }) : null;
}

export { COLLECTIONS };

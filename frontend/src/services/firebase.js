import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: 'AIzaSyD6dCzRoRDMNNZj-JwiYktLeAtSe2qHYnE',
  authDomain: 'monte-online.firebaseapp.com',
  projectId: 'monte-online',
  storageBucket: 'monte-online.firebasestorage.app',
  messagingSenderId: '973731960455',
  appId: '1:973731960455:web:9484cbdee7f401f16f4a22',
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });
export const db = getFirestore(app);
export default app;

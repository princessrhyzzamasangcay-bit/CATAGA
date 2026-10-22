import { useState } from 'react';
import { useData } from '../context/DataContext';
import { auth, googleProvider } from '../services/firebase';
import { signInWithPopup } from 'firebase/auth';

const PORTAL_COPY = {
  passenger: {
    eyebrow: 'PASSENGER PORTAL',
    heading: 'Sign in to book',
    sub: 'Access your account to book a trip and manage reservations.',
    demo: { label: 'Passenger', username: 'passenger', password: '1234' },
  },
  admin: {
    eyebrow: 'ADMIN PORTAL',
    heading: 'Admin sign in',
    sub: 'Sign in to approve bookings and manage operations.',
    demo: { label: 'Admin', username: 'admin', password: 'admin123' },
  },
};

export default function Login({ portal = null, onBack }) {
  const { login, registerPassenger, loginWithGoogle, logout } = useData();
  const [showRegister, setShowRegister] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  const [loginForm, setLoginForm] = useState({ username: '', password: '' });
  const [loginError, setLoginError] = useState('');

  const [regForm, setRegForm] = useState({ name: '', username: '', password: '', confirm: '' });
  const [registerError, setRegisterError] = useState('');

  const copy = portal ? PORTAL_COPY[portal] : null;

  function handleLoginChange(e) {
    setLoginForm((f) => ({ ...f, [e.target.name]: e.target.value }));
  }

  function handleLoginSubmit(e) {
    e.preventDefault();
    setLoginError('');
    try {
      const sess = login(loginForm);
      if (portal && sess.role !== portal) {
        logout();
        const otherLabel = sess.role === 'admin' ? 'an Admin' : 'a Passenger';
        const linkLabel = sess.role === 'admin' ? 'Admin' : 'Passenger';
        setLoginError(`This account is registered as ${otherLabel}. Please go back and choose the ${linkLabel} portal to continue.`);
      }
    } catch (err) {
      setLoginError(err.message);
    }
  }

  function handleRegChange(e) {
    setRegForm((f) => ({ ...f, [e.target.name]: e.target.value }));
  }

  function handleRegisterSubmit(e) {
    e.preventDefault();
    setRegisterError('');
    if (regForm.password.length < 4) {
      setRegisterError('Password must be at least 4 characters.');
      return;
    }
    if (regForm.password !== regForm.confirm) {
      setRegisterError('Passwords do not match.');
      return;
    }
    try {
      registerPassenger(regForm);
    } catch (err) {
      setRegisterError(err.message);
    }
  }

  async function handleGoogleSignIn() {
    setLoginError('');
    setGoogleLoading(true);
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const { displayName, email, uid } = result.user;
      if (!email) throw new Error('Google did not return an email address. Please try another Google account.');

      const sess = await loginWithGoogle({ name: displayName, email, uid, portal });
    } catch (err) {
      const code = err?.code || '';
      if (code === 'auth/popup-closed-by-user') {
        setLoginError('Google sign-in was cancelled.');
      } else if (code === 'auth/popup-blocked') {
        setLoginError('Your browser blocked the Google sign-in window. Allow pop-ups for this site and try again.');
      } else if (code === 'auth/unauthorized-domain') {
        setLoginError('This website is not yet authorized for Google sign-in in Firebase. Add the domain in Firebase Authentication → Settings → Authorized domains.');
      } else if (code === 'auth/operation-not-allowed') {
        setLoginError('Google sign-in is not enabled in Firebase Authentication yet. Enable the Google provider, then try again.');
      } else {
        setLoginError(err?.message || 'Google sign-in failed. Please try again.');
      }
    } finally {
      setGoogleLoading(false);
    }
  }

  return (
    <div className="login">
      <div className="login-visual">
        <div className="login-art-credit">Montenegro Lines</div>
      </div>

      <div className="login-box">
        <div className="mobile-logo logo">M</div>
        {onBack && (
          <button type="button" className="back-link" onClick={onBack}>
            ← Back to home
          </button>
        )}

        {!showRegister ? (
          <>
            <span className="eyebrow">{copy ? copy.eyebrow : 'WELCOME ABOARD'}</span>
            <h2>{copy ? copy.heading : 'Sign in'}</h2>
            <p className="muted">{copy ? copy.sub : 'Access your Montenegro account.'}</p>

            <form onSubmit={handleLoginSubmit}>
              <label>
                Username
                <input
                  name="username"
                  required
                  placeholder="Enter username"
                  value={loginForm.username}
                  onChange={handleLoginChange}
                />
              </label>
              <label>
                Password
                <input
                  name="password"
                  type="password"
                  required
                  placeholder="Enter password"
                  value={loginForm.password}
                  onChange={handleLoginChange}
                />
              </label>
              <button className="btn primary full">Sign in →</button>
              <p className="error">{loginError}</p>
            </form>

            <div className="login-divider"><span>OR</span></div>
            <button
              type="button"
              className="google-btn"
              onClick={handleGoogleSignIn}
              disabled={googleLoading}
              aria-label={`Continue with Google as ${portal === 'admin' ? 'an admin' : 'a passenger'}`}
            >
              <span className="google-mark" aria-hidden="true">
                <svg viewBox="0 0 24 24" role="img">
                  <path fill="#4285F4" d="M21.35 12.23c0-.78-.07-1.53-.22-2.25H12v4.26h5.24a4.48 4.48 0 0 1-1.94 2.94v2.45h3.14c1.84-1.69 2.91-4.18 2.91-7.4Z"/>
                  <path fill="#34A853" d="M12 21.67c2.63 0 4.84-.87 6.45-2.36l-3.14-2.45c-.87.58-1.98.92-3.31.92-2.55 0-4.71-1.72-5.49-4.03H3.27v2.53A9.74 9.74 0 0 0 12 21.67Z"/>
                  <path fill="#FBBC05" d="M6.51 13.75a5.86 5.86 0 0 1 0-3.5V7.72H3.27a9.76 9.76 0 0 0 0 8.56l3.24-2.53Z"/>
                  <path fill="#EA4335" d="M12 6.22c1.43 0 2.71.49 3.72 1.45l2.79-2.79C16.84 3.31 14.63 2.33 12 2.33a9.74 9.74 0 0 0-8.73 5.39l3.24 2.53C7.29 7.94 9.45 6.22 12 6.22Z"/>
                </svg>
              </span>
              <span>{googleLoading ? 'Connecting to Google...' : 'Continue with Google'}</span>
            </button>
            <p className="google-helper">
              {portal === 'admin'
                ? 'Use the Google account already registered as an active Admin.'
                : 'New and existing customers can choose any Google account to access the Passenger Portal.'}
            </p>

            {portal !== 'admin' && (
              <div className="register-link">
                New customer?{' '}
                <button type="button" onClick={() => setShowRegister(true)}>
                  Create an account
                </button>
              </div>
            )}

            <div className="demo">
              <b>Demo access</b>
              {copy ? (
                <div>
                  {copy.demo.label}: <code>{copy.demo.username}</code> / <code>{copy.demo.password}</code>
                </div>
              ) : (
                <>
                  <div>
                    Admin: <code>admin</code> / <code>admin123</code>
                  </div>
                  <div>
                    Passenger: <code>passenger</code> / <code>1234</code>
                  </div>
                </>
              )}
            </div>
          </>
        ) : (
          <form className="register-form" onSubmit={handleRegisterSubmit}>
            <div className="register-title">Create customer account</div>
            <label>
              Full name
              <input
                name="name"
                required
                placeholder="Juan Dela Cruz"
                value={regForm.name}
                onChange={handleRegChange}
              />
            </label>
            <label>
              Username
              <input
                name="username"
                required
                placeholder="Choose a username"
                value={regForm.username}
                onChange={handleRegChange}
              />
            </label>
            <label>
              Password
              <input
                name="password"
                type="password"
                minLength={4}
                required
                placeholder="At least 4 characters"
                value={regForm.password}
                onChange={handleRegChange}
              />
            </label>
            <label>
              Confirm password
              <input
                name="confirm"
                type="password"
                minLength={4}
                required
                placeholder="Repeat password"
                value={regForm.confirm}
                onChange={handleRegChange}
              />
            </label>
            <button className="btn primary full">Register →</button>
            <p className="error">{registerError}</p>
            <button type="button" className="text-btn" onClick={() => setShowRegister(false)}>
              ← Back to sign in
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

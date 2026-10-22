export default function Landing({ onSelectPortal }) {
  return (
    <div className="landing">
      <header className="landing-nav">
        <div className="landing-brand">
          <div className="logo small">M</div>
          <span>MONTENEGRO LINES</span>
        </div>
        <button type="button" className="landing-login" onClick={() => onSelectPortal('passenger')}>
          Log in
        </button>
      </header>

      <section className="landing-hero">
        <div className="landing-hero-copy">
          <span className="eyebrow" style={{ color: '#b7ead5' }}>
            FERRY BOOKING &amp; OPERATIONS
          </span>
          <h1>
            Smooth sailing,
            <br />
            <em>start to finish.</em>
          </h1>
          <p>
            Book ferry trips in minutes, manage reservations, and keep schedules and
            operations organized in one system.
          </p>
          <div className="landing-actions">
            <button type="button" className="btn primary" onClick={() => onSelectPortal('passenger')}>
              Book a trip →
            </button>
            <button type="button" className="landing-hero-link" onClick={() => onSelectPortal('admin')}>
              Admin portal
            </button>
          </div>
        </div>
      </section>

      <section className="landing-portals">
        <button type="button" className="portal-card" onClick={() => onSelectPortal('passenger')}>
          <div className="portal-icon">🎫</div>
          <h3>Passenger</h3>
          <p>Search routes, book a trip, and track your reservations.</p>
          <span className="portal-cta">Continue as Passenger →</span>
        </button>

        <button type="button" className="portal-card admin" onClick={() => onSelectPortal('admin')}>
          <div className="portal-icon">⚓</div>
          <h3>Admin</h3>
          <p>Approve bookings and manage schedules, vessels, routes, and passengers.</p>
          <span className="portal-cta">Continue as Admin →</span>
        </button>
      </section>

      <section className="landing-features" aria-label="Features">
        <div><b>Easy booking</b><span>Reserve trips with a simple flow.</span></div>
        <div><b>Google sign-in</b><span>Passenger accounts can sign in with Google.</span></div>
        <div><b>Centralized operations</b><span>Schedules and reservations in one place.</span></div>
      </section>

      <footer className="landing-footer">
        <span>Montenegro Lines &copy; {new Date().getFullYear()}</span>
      </footer>
    </div>
  );
}

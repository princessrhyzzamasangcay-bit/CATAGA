const adminNav = [
  ['dashboard', '⌂', 'Dashboard'],
  ['bookings', '▣', 'Bookings'],
  ['schedules', '◷', 'Schedules'],
  ['vessels', '⛴', 'Vessels'],
  ['routes', '⌖', 'Routes'],
  ['passengers', '♙', 'Passengers'],
  ['reports', '▥', 'Reports'],
  ['settings', '⚙', 'Settings'],
];

const passengerNav = [
  ['dashboard', '⌂', 'Dashboard'],
  ['booking', '＋', 'Book a Trip'],
  ['bookings', '▣', 'My Bookings'],
  ['routes', '⌖', 'Routes'],
  ['profile', '♙', 'My Profile'],
];

export default function Sidebar({ role, page, onNavigate, onLogout }) {
  const items = role === 'admin' ? adminNav : passengerNav;

  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="logo small">M</div>
        <div>
          <b>Montenegro</b>
          <small>Ferry Lines</small>
        </div>
      </div>
      <div className="side-label">MAIN MENU</div>
      <nav>
        {items.map(([key, icon, label]) => (
          <button
            key={key}
            className={`nav ${key === page ? 'active' : ''}`}
            onClick={() => onNavigate(key)}
          >
            {icon} <span>{label}</span>
          </button>
        ))}
      </nav>
      <div className="side-bottom">
        <div className="support">
          ⚓{' '}
          <span>
            <b>Fleet status</b>
            <small>All systems operational</small>
          </span>
        </div>
        <button className="logout" onClick={onLogout}>
          ↪ <span>Log out</span>
        </button>
      </div>
    </aside>
  );
}

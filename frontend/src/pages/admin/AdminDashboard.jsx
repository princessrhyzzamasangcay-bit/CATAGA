import { useData } from '../../context/DataContext';
import { routes, routeLabel, ships } from '../../data/fleetData';

const weeklyBars = [48, 66, 42, 82, 59, 91, 72];
const weeklyLabels = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const popularCounts = [42, 35, 27, 19];

export default function AdminDashboard({ onNavigate }) {
  const { bookings } = useData();
  const pending = bookings.filter((b) => b.status === 'Pending').length;
  const confirmed = bookings.filter((b) => b.status === 'Confirmed').length;

  return (
    <>
      <div className="hero">
        <div>
          <span className="eyebrow" style={{ color: '#bcd1ef' }}>
            OPERATIONS OVERVIEW
          </span>
          <h1>Good day, Administrator.</h1>
          <p>Monitor bookings, vessels and schedules across Montenegro Lines from one dashboard.</p>
          <button className="btn primary" onClick={() => onNavigate('bookings')}>
            Manage bookings →
          </button>
        </div>
      </div>

      <div className="cards">
        <div className="metric">
          <div className="m-top">
            TOTAL BOOKINGS <span className="mi">▣</span>
          </div>
          <strong>{bookings.length}</strong>
          <span className="trend">↑ Live records</span>
        </div>
        <div className="metric">
          <div className="m-top">
            CONFIRMED <span className="mi">✓</span>
          </div>
          <strong>{confirmed}</strong>
          <span className="trend">Ready for departure</span>
        </div>
        <div className="metric">
          <div className="m-top">
            PENDING <span className="mi">◷</span>
          </div>
          <strong>{pending}</strong>
          <span className="trend">Needs attention</span>
        </div>
        <div className="metric">
          <div className="m-top">
            ACTIVE VESSELS <span className="mi">⛴</span>
          </div>
          <strong>
            {ships.filter((s) => s.status === 'Operational').length}/{ships.length}
          </strong>
          <span className="trend">Fleet status</span>
        </div>
      </div>

      <div className="grid2">
        <div className="panel">
          <div className="panel-head">
            <h3>Weekly bookings</h3>
            <span>Last 7 days</span>
          </div>
          <div className="bars">
            {weeklyBars.map((v, i) => (
              <div className="bar" style={{ height: `${v}%` }} key={i}>
                <small>{weeklyLabels[i]}</small>
              </div>
            ))}
          </div>
        </div>
        <div className="panel">
          <div className="panel-head">
            <h3>Popular routes</h3>
            <span>Bookings</span>
          </div>
          <div className="route-list">
            {routes.slice(0, 4).map((r, i) => (
              <div className="route-row" key={routeLabel(r)}>
                <div>
                  <b>{routeLabel(r)}</b>
                  <small>{r.frequency}</small>
                </div>
                <strong>{popularCounts[i]}</strong>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

import { useData } from '../../context/DataContext';
import { routes, ships } from '../../data/fleetData';
import RouteCards from '../../components/RouteCards';

export default function PassengerDashboard({ onNavigate }) {
  const { bookings, session } = useData();
  const mine = bookings.filter((b) => b.userId === session.id);
  const confirmed = mine.filter((b) => b.status === 'Confirmed').length;

  return (
    <>
      <div className="hero">
        <div>
          <span className="eyebrow" style={{ color: '#bcd1ef' }}>
            YOUR NEXT JOURNEY
          </span>
          <h1>Ready to set sail?</h1>
          <p>Book a Montenegro trip, check your reservations and explore available routes.</p>
          <button className="btn primary" onClick={() => onNavigate('booking')}>
            Book a trip →
          </button>
        </div>
      </div>
      <div className="cards">
        <div className="metric">
          <div className="m-top">MY BOOKINGS</div>
          <strong>{mine.length}</strong>
        </div>
        <div className="metric">
          <div className="m-top">CONFIRMED</div>
          <strong>{confirmed}</strong>
        </div>
        <div className="metric">
          <div className="m-top">ROUTES</div>
          <strong>{routes.length}</strong>
        </div>
        <div className="metric">
          <div className="m-top">VESSELS</div>
          <strong>{ships.length}</strong>
        </div>
      </div>
      <RouteCards />
    </>
  );
}

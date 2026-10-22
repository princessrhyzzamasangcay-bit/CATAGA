import { useData } from '../../context/DataContext';

export default function Passengers() {
  const { bookings } = useData();
  const names = [...new Set(bookings.map((b) => b.name))];

  return (
    <div className="panel">
      <div className="panel-head">
        <h3>Passenger directory</h3>
        <span>{names.length} registered from bookings</span>
      </div>
      <div className="table">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Bookings</th>
              <th>Last route</th>
              <th>Account</th>
            </tr>
          </thead>
          <tbody>
            {names.length === 0 ? (
              <tr>
                <td colSpan="4" className="empty">
                  No passenger records yet.
                </td>
              </tr>
            ) : (
              names.map((n) => {
                const bs = bookings.filter((b) => b.name === n);
                return (
                  <tr key={n}>
                    <td>
                      <b>{n}</b>
                    </td>
                    <td>{bs.length}</td>
                    <td>{bs[0].route}</td>
                    <td>
                      <span className="badge blue">Passenger</span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

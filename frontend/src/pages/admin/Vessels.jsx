import { ships } from '../../data/fleetData';

export default function Vessels() {
  return (
    <>
      <div className="section-title">Fleet management</div>
      <p className="sub">Monitor Montenegro vessels and operating capacity.</p>
      <div className="fleet">
        {ships.map((s) => (
          <div className="ship" key={s.name}>
            <div className="ship-icon">⛴</div>
            <h4>{s.name}</h4>
            <small>{s.type}</small>
            <div className="ship-meta">
              <b>{s.capacity}</b>
              <span className={`badge ${s.status === 'Operational' ? 'green' : 'amber'}`}>
                {s.status}
              </span>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

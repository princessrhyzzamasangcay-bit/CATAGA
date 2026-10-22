import { useData } from '../../context/DataContext';
import { initials } from '../../utils';

export default function Profile() {
  const { session } = useData();

  return (
    <div className="panel">
      <div className="profile-card">
        <div className="logo small">{initials(session.name)}</div>
        <div>
          <h3>{session.name}</h3>
          <p className="muted">Passenger account</p>
          <p className="muted">Montenegro Lines customer profile.</p>
        </div>
      </div>
    </div>
  );
}

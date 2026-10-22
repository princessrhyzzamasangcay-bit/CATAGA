import React from 'react';
import { useData } from '../../context/DataContext';
import { useToast } from '../../context/ToastContext';

const toText = (value) => Array.isArray(value) ? value.join(', ') : (value ?? '');

export default function MyBookings() {
  const { bookings, session, payBooking, viewTicket, updateBooking, deleteBooking } = useData();
  const showToast = useToast();
  const mine = bookings.filter((b) => b.userId === session.id);
  const [showHistory, setShowHistory] = React.useState(false);
  const [editing, setEditing] = React.useState(null);
  const [detailsId, setDetailsId] = React.useState(null);
  const [saving, setSaving] = React.useState(false);
  const visibleBookings = showHistory ? mine.filter((b) => b.status === 'Cancelled') : mine;

  function beginEdit(b) {
    setEditing({
      ...b,
      seatsText: toText(b.seats),
      passengersText: JSON.stringify(b.passengers || [], null, 2),
    });
  }

  async function saveEdit(event) {
    event.preventDefault();
    if (!editing) return;
    const qty = Number(editing.qty);
    if (!editing.date || !Number.isInteger(qty) || qty < 1 || !editing.route.trim() || !editing.schedule.trim()) {
      showToast('Please enter a route, travel date, schedule, and valid passenger quantity.');
      return;
    }
    let passengers;
    try {
      passengers = JSON.parse(editing.passengersText || '[]');
      if (!Array.isArray(passengers)) throw new Error('Passenger details must be a JSON list.');
    } catch {
      showToast('Passenger details are invalid. Please check the passenger list format.');
      return;
    }
    const changes = {
      name: editing.name,
      contact: editing.contact,
      route: editing.route.trim(),
      date: editing.date,
      schedule: editing.schedule.trim(),
      qty,
      accom: editing.accom,
      payment: editing.payment,
      vessel: editing.vessel,
      seats: editing.seatsText.split(',').map((seat) => seat.trim()).filter(Boolean),
      passengers,
    };
    setSaving(true);
    try {
      await updateBooking(editing.id, changes);
      console.log('PASSENGER UPDATED BOOKING:', { id: editing.id, changes });
      showToast('Booking updated. Admin and passenger booking records have been notified.');
      setEditing(null);
    } catch (error) {
      console.error('Passenger booking edit failed:', error);
      showToast(error.message || 'Booking could not be updated.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="panel">
      <div className="panel-head" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
        <h3>My bookings</h3>
        <button type="button" className="text-button" onClick={() => setShowHistory((value) => !value)} aria-pressed={showHistory}>
          {showHistory ? 'All bookings' : 'Reservation history'}
        </button>
      </div>
      <div className="table">
        <table>
          <thead><tr><th>ID</th><th>Route</th><th>Date</th><th>Schedule</th><th>Pax</th><th>Payment</th><th>Status</th><th>Action</th></tr></thead>
          <tbody>
            {visibleBookings.length === 0 ? <tr><td colSpan="8" className="empty">No bookings found.</td></tr> : visibleBookings.map((b) => (
              <React.Fragment key={b.id}>
                <tr>
                  <td><b>{b.id}</b></td><td>{b.route}</td><td>{b.date}</td><td>{b.schedule}</td><td>{b.qty}</td>
                  <td><span className={`badge ${b.paid ? 'green' : 'amber'}`}>{b.paid ? 'Paid' : 'Unpaid'}</span></td>
                  <td><span className={`badge ${b.status === 'Confirmed' ? 'green' : b.status === 'Cancelled' ? 'red' : 'amber'}`}>{b.status}</span></td>
                  <td className="actions" style={{ whiteSpace: 'nowrap' }}>
                    <button className="mini" type="button" onClick={() => setDetailsId(detailsId === b.id ? null : b.id)}>{detailsId === b.id ? 'Hide details' : 'Details'}</button>
                    {!b.paid && b.status !== 'Cancelled' && <button className="mini" onClick={() => payBooking(b.id)}>Pay now</button>}
                    {b.paid && b.status !== 'Cancelled' && <button className="mini" onClick={() => viewTicket(b.id)}>View ticket</button>}
                    <button className="mini" type="button" onClick={() => beginEdit(b)}>Edit</button>
                    <button className="mini danger" type="button" onClick={async () => {
                      if (!window.confirm(`Delete booking ${b.id}? This will remove it from the booking system.`)) return;
                      try { await deleteBooking(b.id); console.log('PASSENGER DELETED BOOKING:', { id: b.id }); showToast('Booking deleted successfully.'); }
                      catch (error) { console.error('Passenger booking delete failed:', error); showToast(error.message || 'Booking could not be deleted.'); }
                    }}>Delete</button>
                  </td>
                </tr>
                {detailsId === b.id && <tr><td colSpan="8" style={{ background: '#f8fbfa', whiteSpace: 'normal' }}>
                  <strong>Booking details</strong><div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 10, marginTop: 10 }}>
                    <div><b>Lead passenger:</b> {b.name || '—'}</div><div><b>Contact:</b> {b.contact || '—'}</div><div><b>Accommodation:</b> {b.accom || '—'}</div><div><b>Payment method:</b> {b.payment || '—'}</div><div><b>Vessel:</b> {b.vessel || '—'}</div><div><b>Seats:</b> {toText(b.seats) || '—'}</div><div><b>Amount:</b> {b.amount ?? '—'}</div>
                  </div>
                  <div style={{ marginTop: 10 }}><b>Passenger details:</b> {Array.isArray(b.passengers) && b.passengers.length ? b.passengers.map((p, i) => `${i + 1}. ${p.name || 'Unnamed'}${p.age ? `, age ${p.age}` : ''}${p.gender ? `, ${p.gender}` : ''}${p.contact ? `, ${p.contact}` : ''}`).join(' · ') : 'No additional passenger details saved.'}</div>
                </td></tr>}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>

      {editing && <div role="dialog" aria-modal="true" aria-labelledby="edit-booking-title" style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,.45)', display: 'grid', placeItems: 'center', padding: 16 }}>
        <form onSubmit={saveEdit} style={{ background: '#fff', color: '#123', width: 'min(760px, 100%)', maxHeight: '90vh', overflowY: 'auto', borderRadius: 16, padding: 24, boxShadow: '0 20px 60px rgba(0,0,0,.25)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}><h3 id="edit-booking-title">Edit booking — {editing.id}</h3><button type="button" className="mini" onClick={() => setEditing(null)}>Close</button></div>
          <p>Update the information entered during Book a Trip. Changes will be sent to the shared booking backend.</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 14 }}>
            <label>Route<input required value={editing.route || ''} onChange={(e) => setEditing({ ...editing, route: e.target.value })} /></label>
            <label>Travel date<input required type="date" value={editing.date || ''} onChange={(e) => setEditing({ ...editing, date: e.target.value })} /></label>
            <label>Schedule<input required value={editing.schedule || ''} onChange={(e) => setEditing({ ...editing, schedule: e.target.value })} /></label>
            <label>Number of passengers<input required type="number" min="1" value={editing.qty || 1} onChange={(e) => setEditing({ ...editing, qty: e.target.value })} /></label>
            <label>Lead passenger name<input value={editing.name || ''} onChange={(e) => setEditing({ ...editing, name: e.target.value })} /></label>
            <label>Contact number<input value={editing.contact || ''} onChange={(e) => setEditing({ ...editing, contact: e.target.value })} /></label>
            <label>Accommodation<input value={editing.accom || ''} onChange={(e) => setEditing({ ...editing, accom: e.target.value })} /></label>
            <label>Payment method<input value={editing.payment || ''} onChange={(e) => setEditing({ ...editing, payment: e.target.value })} /></label>
            <label>Vessel<input value={editing.vessel || ''} onChange={(e) => setEditing({ ...editing, vessel: e.target.value })} /></label>
            <label>Seats (comma-separated)<input value={editing.seatsText} onChange={(e) => setEditing({ ...editing, seatsText: e.target.value })} /></label>
          </div>
          <label style={{ display: 'block', marginTop: 14 }}>Passenger information (JSON list; name, age, gender, contact)<textarea rows="6" value={editing.passengersText} onChange={(e) => setEditing({ ...editing, passengersText: e.target.value })} style={{ width: '100%', fontFamily: 'monospace' }} /></label>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 18 }}><button type="button" className="mini" onClick={() => setEditing(null)}>Cancel</button><button type="submit" className="mini" disabled={saving}>{saving ? 'Saving…' : 'Save changes'}</button></div>
        </form>
      </div>}
    </div>
  );
}

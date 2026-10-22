export default function TicketModal({ booking, onClose }) {
  if (!booking) return null;

  return (
    <div className="modal-overlay" id="ticketModal">
      <div className="ticket-card">
        <div className="ticket-head">
          <div className="logo small">M</div>
          <div>
            <b>Montenegro Lines</b>
            <small>E-Ticket / Boarding Pass</small>
          </div>
        </div>

        <div className="ticket-id">{booking.id}</div>

        <div className="ticket-grid">
          <div>
            <small>PASSENGER</small>
            <b>{booking.name}</b>
          </div>
          <div>
            <small>ROUTE</small>
            <b>{booking.route}</b>
          </div>
          <div>
            <small>DATE</small>
            <b>{booking.date || '-'}</b>
          </div>
          <div>
            <small>DEPARTURE</small>
            <b>{booking.schedule}</b>
          </div>
          <div>
            <small>VESSEL</small>
            <b>{booking.vessel || '-'}</b>
          </div>
          <div>
            <small>SEATS</small>
            <b>{booking.seats?.join(', ') || '-'}</b>
          </div>
          <div>
            <small>PASSENGERS</small>
            <b>{booking.qty}</b>
          </div>
          <div>
            <small>PAYMENT</small>
            <b>{booking.payment || '-'}</b>
          </div>
          <div>
            <small>AMOUNT PAID</small>
            <b>₱{(booking.amount || 0).toLocaleString()}</b>
          </div>
        </div>

        <div className="ticket-status">
          <span className={`badge ${booking.paid ? 'green' : 'amber'}`}>
            {booking.paid ? 'PAID' : 'UNPAID'}
          </span>
          <span className="badge blue">{booking.status}</span>
        </div>

        <div className="ticket-bar">▮▯▮▮▯▯▮▯▮▮▮▯▯▮▮▯▮▯▮▮</div>

        <p className="ticket-note">
          Present this ticket (digital or printed) upon boarding. Arrive at least 30 minutes
          before departure.
        </p>

        <div className="ticket-actions no-print">
          <button className="btn primary" onClick={() => window.print()}>
            🖶 Print ticket
          </button>
          <button className="btn" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

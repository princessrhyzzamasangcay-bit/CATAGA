import { useEffect, useMemo, useState } from 'react';
import { useData } from '../../context/DataContext';
import { useToast } from '../../context/ToastContext';
import { fareNum, getScheduleRows, routeLabel, routes, scheduleRows, syncFleetConfig } from '../../data/fleetData';

export default function Bookings({ onNavigate }) {
  const { bookings, updateBooking, deleteBooking } = useData();
  const showToast = useToast();
  const [search, setSearch] = useState('');

  // Separate state variables for the booking currently being edited.
  const [editID, setEditID] = useState('');
  const [editName, setEditName] = useState('');
  const [editContact, setEditContact] = useState('');
  const [editRoute, setEditRoute] = useState('');
  const [editDate, setEditDate] = useState('');
  const [editSchedule, setEditSchedule] = useState('');
  const [editQty, setEditQty] = useState(1);
  const [editStatus, setEditStatus] = useState('Pending');
  const [editPaid, setEditPaid] = useState(false);
  const [editOriginalBooking, setEditOriginalBooking] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Always refresh the shared schedule configuration before using fares in this page.
  useEffect(() => {
    syncFleetConfig().catch((error) => console.warn('Could not refresh schedules:', error));
  }, []);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();

    return bookings.filter((booking) =>
      [
        booking.id,
        booking.name,
        booking.contact,
        booking.route,
        booking.date,
        booking.schedule,
        booking.status,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(query)
    );
  }, [bookings, search]);

  // 1. Edit button opens the form for the selected booking.
  function openEditModal(booking) {
    setIsModalOpen(true);

    // 2. Store the selected booking in separate state variables.
    setEditOriginalBooking(booking);
    setEditID(booking.id);
    setEditName(booking.name || '');
    setEditContact(booking.contact || '');
    setEditRoute(booking.route || '');
    setEditDate(booking.date || '');
    setEditSchedule(booking.schedule || '');
    setEditQty(Number(booking.qty) || 1);
    setEditStatus(booking.status || 'Pending');
    setEditPaid(Boolean(booking.paid));
  }

  function closeEditModal() {
    if (isSaving) return;
    setIsModalOpen(false);
    setEditID('');
  }

  const selectedRoute = routes.find((route) => routeLabel(route) === editRoute);
  // Schedule records are the source of truth for fares. Do not fall back to the
  // old hard-coded route fare, which can make an edited booking show a stale price.
  const routeScheduleRows = scheduleRows.filter((row) => row.route === editRoute);
  const dateScheduleRows = selectedRoute ? getScheduleRows(selectedRoute, editDate) : [];
  const availableScheduleRows = dateScheduleRows.length
    ? dateScheduleRows
    : routeScheduleRows;
  const availableSchedules = availableScheduleRows.map((row) => row.time);
  const selectedScheduleRow = availableScheduleRows.find((row) => row.time === editSchedule)
    || routeScheduleRows.find((row) => row.time === editSchedule)
    || null;
  const currentFare = selectedScheduleRow ? fareNum(selectedScheduleRow.fare) : fareNum(editOriginalBooking?.fare ?? 0);
  const sameOriginalTrip = editOriginalBooking && editOriginalBooking.route === editRoute && editOriginalBooking.schedule === editSchedule && String(editOriginalBooking.date || '') === String(editDate || '') && Number(editOriginalBooking.qty || 1) === (Number(editQty) || 1);
  const estimatedAmount = sameOriginalTrip ? Number(editOriginalBooking.amount ?? 0) : (Array.isArray(editOriginalBooking?.fareBreakdown) && editOriginalBooking.fareBreakdown.length === (Number(editQty) || 1)
    ? Math.round(editOriginalBooking.fareBreakdown.reduce((sum, item) => { const rate = Math.max(0, Math.min(100, Number(item.discountPercent ?? 0))) / 100; return sum + Math.round(currentFare * (1 - rate) * 100) / 100; }, 0) * 100) / 100
    : currentFare * (Number(editQty) || 1));

  // 3. The value of every input comes from the matching edit state.
  // 4. onChange updates that state when the admin changes an input.
  // 5. onSubmit calls the update function below.
  // 6. The edited data is sent together with the booking ID.
  async function handleUpdate(event) {
    event.preventDefault();

    if (!editID) {
      showToast('No booking was selected for editing.');
      return;
    }

    const route = routes.find((item) => routeLabel(item) === editRoute);
    const quantity = Math.max(1, Number(editQty) || 1);
    const dateRows = route ? getScheduleRows(route, editDate) : [];
    const matchedSchedule = dateRows.find((row) => row.time === editSchedule)
      || scheduleRows.find((row) => row.route === editRoute && row.time === editSchedule)
      || null;
    const fare = matchedSchedule
      ? fareNum(matchedSchedule.fare)
      : (editOriginalBooking && editOriginalBooking.route === editRoute && editOriginalBooking.schedule === editSchedule
        ? fareNum(editOriginalBooking.fare ?? 0)
        : 0);
    const sameTrip = editOriginalBooking && editOriginalBooking.route === editRoute && editOriginalBooking.schedule === editSchedule && String(editOriginalBooking.date || '') === String(editDate || '') && Number(editOriginalBooking.qty || 1) === quantity;
    const amount = sameTrip ? Number(editOriginalBooking.amount ?? 0) : (Array.isArray(editOriginalBooking?.fareBreakdown) && editOriginalBooking.fareBreakdown.length ? Math.round(editOriginalBooking.fareBreakdown.slice(0, quantity).reduce((sum, item) => { const rate = Math.max(0, Math.min(100, Number(item.discountPercent ?? 0))) / 100; return sum + Math.round(fare * (1 - rate) * 100) / 100; }, 0) * 100) / 100 : fare * quantity);

    const editedData = {
      name: editName.trim(),
      contact: editContact.trim(),
      route: editRoute,
      date: editDate,
      schedule: editSchedule,
      qty: quantity,
      amount,
      fare,
      scheduleKey: matchedSchedule?.id || editOriginalBooking?.scheduleKey || null,
      fareBreakdown: Array.isArray(editOriginalBooking?.fareBreakdown) ? editOriginalBooking.fareBreakdown.map((item) => ({ ...item, baseFare: fare, discountAmount: Math.round(fare * (Math.max(0, Math.min(100, Number(item.discountPercent ?? 0))) / 100) * 100) / 100, finalFare: Math.round(fare * (1 - Math.max(0, Math.min(100, Number(item.discountPercent ?? 0))) / 100) * 100) / 100 })) : [],
      status: editStatus,
      paid: editPaid,
      vessel: route?.vessel || '',
    };

    if (
      !editedData.name ||
      !editedData.contact ||
      !editedData.route ||
      !editedData.date ||
      !editedData.schedule
    ) {
      showToast('Please complete all booking fields.');
      return;
    }

    setIsSaving(true);

    try {
      const updatedBooking = await updateBooking(editID, editedData);

      console.log('BOOKING UPDATED FROM ADMIN:', updatedBooking);
      setIsModalOpen(false);
      showToast(`Booking ${editID} updated successfully.`);
    } catch (error) {
      console.error('Booking update failed:', error);
      showToast(error.message || 'Booking could not be updated.');
    } finally {
      setIsSaving(false);
    }
  }

  function handleRouteChange(event) {
    const nextRoute = event.target.value;
    setEditRoute(nextRoute);

    // Recalculate the available schedules when the route changes.
    const route = routes.find((item) => routeLabel(item) === nextRoute);
    const datedRows = route ? getScheduleRows(route, editDate) : [];
    const schedules = (datedRows.length ? datedRows : scheduleRows.filter((row) => row.route === nextRoute))
      .map((row) => row.time);

    setEditSchedule(schedules.includes(editSchedule) ? editSchedule : (schedules[0] || ''));
  }

  return (
    <div className="panel">
      <div className="panel-head">
        <div>
          <h3>Passenger bookings</h3>
          <span>Review and manage reservations</span>
        </div>
      </div>

      <div className="toolbar">
        <input
          placeholder="Search booking or passenger..."
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </div>

      <div className="table">
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Passenger</th>
              <th>Route</th>
              <th>Date</th>
              <th>Schedule</th>
              <th>Pax</th>
              <th>Amount Paid</th>
              <th>Payment</th>
              <th>Status</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan="10" className="empty">
                  No bookings found.
                </td>
              </tr>
            ) : (
              filtered.map((booking) => (
                <tr key={booking.id}>
                  <td>
                    <b>{booking.id}</b>
                  </td>
                  <td>{booking.name}</td>
                  <td>{booking.route}</td>
                  <td>{booking.date}</td>
                  <td>{booking.schedule}</td>
                  <td>{booking.qty}</td>
                  <td><strong>₱{Number(booking.amount ?? 0).toLocaleString()}</strong></td>
                  <td>
                    <span className={`badge ${booking.paid ? 'green' : 'amber'}`}>
                      {booking.paid ? 'Paid' : 'Unpaid'}
                    </span>
                  </td>
                  <td>
                    <span
                      className={`badge ${
                        booking.status === 'Confirmed'
                          ? 'green'
                          : booking.status === 'Cancelled'
                            ? 'red'
                            : 'amber'
                      }`}
                    >
                      {booking.status}
                    </span>
                  </td>
                  <td className="actions">
                    <button
                      type="button"
                      className="mini"
                      onClick={() => openEditModal(booking)}
                    >
                      Edit
                    </button>
                    <button type="button" className="mini danger" onClick={async () => {
                      if (!window.confirm(`Delete booking ${booking.id}? This cannot be undone.`)) return;
                      try { await deleteBooking(booking.id); showToast(`Booking ${booking.id} deleted.`); }
                      catch (error) { console.error('Booking delete failed:', error); showToast(error.message || 'Booking could not be deleted.'); }
                    }}>Delete</button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {isModalOpen && (
        <div
          className="booking-edit-overlay"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeEditModal();
          }}
        >
          <div
            className="booking-edit-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="edit-booking-title"
          >
            <div className="booking-edit-header">
              <div>
                <span className="eyebrow">BOOKING EDIT</span>
                <h3 id="edit-booking-title">Edit Customer Booking</h3>
                <small>{editID}</small>
              </div>
              <button
                type="button"
                className="booking-edit-close"
                onClick={closeEditModal}
                disabled={isSaving}
                aria-label="Close"
              >
                ×
              </button>
            </div>

            <form onSubmit={handleUpdate}>
              <div className="booking-edit-body">
                <div className="booking-edit-field">
                  <label htmlFor="editName">Passenger Name</label>
                  <input
                    id="editName"
                    type="text"
                    value={editName}
                    onChange={(event) => setEditName(event.target.value)}
                    required
                  />
                </div>

                <div className="booking-edit-field">
                  <label htmlFor="editContact">Contact Number</label>
                  <input
                    id="editContact"
                    type="text"
                    value={editContact}
                    onChange={(event) => setEditContact(event.target.value)}
                    required
                  />
                </div>

                <div className="booking-edit-field booking-edit-full">
                  <label htmlFor="editRoute">Route</label>
                  <select
                    id="editRoute"
                    value={editRoute}
                    onChange={handleRouteChange}
                    required
                  >
                    <option value="">Select route</option>
                    {routes.map((route) => {
                      const label = routeLabel(route);
                      return <option key={label} value={label}>{label}</option>;
                    })}
                  </select>
                </div>

                <div className="booking-edit-field">
                  <label htmlFor="editDate">Travel Date</label>
                  <input
                    id="editDate"
                    type="date"
                    value={editDate}
                    onChange={(event) => {
                      setEditDate(event.target.value);
                      setEditSchedule('');
                    }}
                    required
                  />
                </div>

                <div className="booking-edit-field">
                  <label htmlFor="editSchedule">Schedule</label>
                  <select
                    id="editSchedule"
                    value={editSchedule}
                    onChange={(event) => setEditSchedule(event.target.value)}
                    required
                  >
                    <option value="">Select schedule</option>
                    {(availableScheduleRows.length > 0
                      ? availableScheduleRows
                      : editSchedule
                        ? [{ time: editSchedule, fare: editOriginalBooking?.fare ?? 0 }]
                        : []
                    ).map((row) => (
                      <option key={`${row.id || row.time}`} value={row.time}>
                        {row.time} — ₱{fareNum(row.fare).toLocaleString()}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="booking-edit-field">
                  <label htmlFor="editQty">Number of Passengers</label>
                  <input
                    id="editQty"
                    type="number"
                    min="1"
                    value={editQty}
                    onChange={(event) => setEditQty(event.target.value)}
                    required
                  />
                </div>

                <div className="booking-edit-field">
                  <label htmlFor="editStatus">Booking Status</label>
                  <select
                    id="editStatus"
                    value={editStatus}
                    onChange={(event) => setEditStatus(event.target.value)}
                    required
                  >
                    <option>Pending</option>
                    <option>Confirmed</option>
                    <option>Cancelled</option>
                  </select>
                </div>

                <div className="booking-edit-field booking-edit-full">
                  <label htmlFor="editPaid">Payment</label>
                  <select
                    id="editPaid"
                    value={editPaid ? 'Paid' : 'Unpaid'}
                    onChange={(event) => setEditPaid(event.target.value === 'Paid')}
                  >
                    <option>Unpaid</option>
                    <option>Paid</option>
                  </select>
                </div>

                <div className="booking-edit-summary booking-edit-full">
                  <span>{editPaid ? 'Amount paid' : 'Booking total'}</span>
                  <strong>₱{Number(estimatedAmount || 0).toLocaleString('en-PH', { maximumFractionDigits: 2 })}</strong>
                  {Array.isArray(editOriginalBooking?.fareBreakdown) && editOriginalBooking.fareBreakdown.some((item) => Number(item.discountPercent || 0) > 0) && (
                    <small>Discount applied: ₱{editOriginalBooking.fareBreakdown.reduce((sum, item) => sum + Number(item.discountAmount || 0), 0).toLocaleString('en-PH', { maximumFractionDigits: 2 })}</small>
                  )}
                </div>
              </div>

              <div className="booking-edit-footer">
                <button
                  type="button"
                  className="btn"
                  onClick={closeEditModal}
                  disabled={isSaving}
                >
                  Cancel
                </button>
                <button type="submit" className="btn primary" disabled={isSaving}>
                  {isSaving ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

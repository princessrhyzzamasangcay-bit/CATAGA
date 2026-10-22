import { useEffect, useState } from 'react';
import {
  addSchedule,
  deleteSchedule,
  routeLabel,
  routes,
  scheduleRows,
  ships,
  syncFleetConfig,
  updateSchedule,
} from '../../data/fleetData';
import { useToast } from '../../context/ToastContext';

const EMPTY_FORM = {
  time: '',
  route: '',
  vessel: '',
  capacity: '',
  days: 'Daily',
  fare: '',
};

export default function Schedules() {
  const showToast = useToast();
  const [, refresh] = useState(0);
  const [editingKey, setEditingKey] = useState(null);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    syncFleetConfig().finally(() => refresh((value) => value + 1));

    const refreshSchedules = () => refresh((value) => value + 1);
    window.addEventListener('schedule-updated', refreshSchedules);
    const poll = window.setInterval(() => {
      syncFleetConfig().finally(() => refreshSchedules());
    }, 2500);

    return () => {
      window.clearInterval(poll);
      window.removeEventListener('schedule-updated', refreshSchedules);
    };
  }, []);

  function openEdit(row) {
    setIsAddOpen(false);
    setEditingKey(row.id);
    setForm({
      time: row.time,
      route: row.route,
      vessel: row.vessel,
      capacity: String(row.capacity),
      days: row.days || 'Daily',
      fare: String(row.fare ?? ''),
    });
  }

  function openAdd() {
    setEditingKey(null);
    setForm({
      ...EMPTY_FORM,
      route: routeLabel(routes[0]),
      vessel: ships[0]?.name || '',
      // A new schedule must have its own fare. Do not copy an old route fare.
      fare: '',
    });
    setIsAddOpen(true);
  }

  function closeModal() {
    if (saving) return;
    setEditingKey(null);
    setIsAddOpen(false);
    setForm(EMPTY_FORM);
  }

  function handleChange(event) {
    const { name, value } = event.target;
    setForm((current) => {
      const next = { ...current, [name]: value };
      if (name === 'route') {
        const route = routes.find((item) => routeLabel(item) === value);
        if (route) {
          // Changing the route must not silently replace the fare entered for this schedule.
          next.vessel = route.vessel || current.vessel;
        }
      }
      return next;
    });
  }

  async function handleSave(event) {
    event.preventDefault();
    const capacity = Number(form.capacity);
    const fare = Number(String(form.fare).replace(/[₱,]/g, ''));
    if (!Number.isFinite(fare) || fare < 0) {
      showToast('Enter a valid passenger fare.');
      return;
    }

    if (!Number.isFinite(capacity) || capacity < 1) {
      showToast('Capacity must be a valid number.');
      return;
    }

    setSaving(true);

    try {
      if (editingKey) {
        const original = scheduleRows.find((row) => row.id === editingKey);

        if (!original) {
          throw new Error('Schedule not found.');
        }

        const updated = await updateSchedule(editingKey, form);
        console.log('SCHEDULE UPDATED:', { previous: original, updated });
        showToast('Schedule updated successfully.');
      } else {
        const created = await addSchedule(form);
        showToast('Schedule added successfully.');
      }

      closeModal();
      refresh((value) => value + 1);
    } catch (error) {
      showToast(error.message || 'Schedule could not be saved.');
    } finally {
      setSaving(false);
    }
  }

  const modalOpen = Boolean(editingKey || isAddOpen);

  return (
    <>
      <div className="section-title">Daily sailing schedules</div>
      <p className="sub">Manage departure times, destinations, operating days, vessel fares, and capacity.</p>

      <div className="panel table">
        <div className="panel-head">
          <div>
            <h3>Schedules</h3>
            <span>Changes are used by the passenger booking flow.</span>
          </div>
          <button type="button" className="btn primary" onClick={openAdd}>
            + Add Schedule
          </button>
        </div>

        <table>
          <thead>
            <tr>
              <th>Time</th>
              <th>Route</th>
              <th>Vessel</th>
              <th>Fare</th>
              <th>Operating Days</th>
              <th>Capacity</th>
              <th>Available Seats</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {scheduleRows.map((row) => {
              const remaining = Math.max(0, Number(row.capacity) - Number(row.booked || 0));

              return (
                <tr key={row.id}>
                  <td><b>{row.time}</b></td>
                  <td>{row.route}</td>
                  <td>{row.vessel}</td>
                  <td>₱{Number(row.fare ?? 0).toLocaleString()}</td>
                  <td>{row.days || 'Daily'}</td>
                  <td>{Number(row.capacity).toLocaleString()}</td>
                  <td>{remaining.toLocaleString()} seats</td>
                  <td>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <button type="button" className="mini" onClick={() => openEdit(row)}>Edit</button>
                      <button type="button" className="mini danger" onClick={async () => {
                        if (!window.confirm(`Delete the ${row.time} schedule for ${row.route}? It will no longer appear in passenger trip options.`)) return;
                        try {
                          await deleteSchedule(row.id);
                          console.log('SCHEDULE DELETED:', { id: row.id, time: row.time, route: row.route, vessel: row.vessel });
                          showToast('Schedule deleted and passenger trip options updated.');
                          refresh((value) => value + 1);
                        } catch (error) {
                          console.error('Schedule delete failed:', error);
                          showToast(error.message || 'Schedule could not be deleted.');
                        }
                      }}>Delete</button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {modalOpen && (
        <div
          className="booking-edit-overlay"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeModal();
          }}
        >
          <div className="booking-edit-modal schedule-edit-modal" role="dialog" aria-modal="true">
            <div className="booking-edit-header">
              <div>
                <span className="eyebrow">{editingKey ? 'SCHEDULE EDIT' : 'NEW SCHEDULE'}</span>
                <h3>{editingKey ? 'Edit Schedule' : 'Add Schedule'}</h3>
                <small>Saved schedules are available to passengers when they search for a trip.</small>
              </div>
              <button type="button" className="booking-edit-close" onClick={closeModal} disabled={saving}>
                ×
              </button>
            </div>

            <form onSubmit={handleSave}>
              <div className="booking-edit-body">
                <div className="booking-edit-field">
                  <label htmlFor="scheduleTime">Departure Time</label>
                  <input id="scheduleTime" name="time" value={form.time} onChange={handleChange} placeholder="04:00 AM" required />
                </div>

                <div className="booking-edit-field">
                  <label htmlFor="scheduleDays">Operating Days</label>
                  <select id="scheduleDays" name="days" value={form.days} onChange={handleChange} required>
                    {['Daily', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday', 'Tuesday & Friday', 'Monday & Thursday', 'Saturday & Sunday'].map((day) => <option key={day} value={day}>{day}</option>)}
                  </select>
                </div>

                <div className="booking-edit-field booking-edit-full">
                  <label htmlFor="scheduleRoute">Route / Destination (From → To)</label>
                  <select id="scheduleRoute" name="route" value={form.route} onChange={handleChange} required>
                    {routes.map((route) => (
                      <option key={routeLabel(route)} value={routeLabel(route)}>{routeLabel(route)}</option>
                    ))}
                  </select>
                </div>

                <div className="booking-edit-field">
                  <label htmlFor="scheduleVessel">Vessel</label>
                  <select id="scheduleVessel" name="vessel" value={form.vessel} onChange={handleChange} required>
                    {ships.map((ship) => (
                      <option key={ship.name} value={ship.name}>{ship.name}</option>
                    ))}
                  </select>
                </div>

                <div className="booking-edit-field">
                  <label htmlFor="scheduleFare">Passenger Fare (₱)</label>
                  <input id="scheduleFare" name="fare" type="number" min="0" step="1" value={form.fare} onChange={handleChange} required />
                </div>

                <div className="booking-edit-field">
                  <label htmlFor="scheduleCapacity">Passenger Capacity</label>
                  <input id="scheduleCapacity" name="capacity" type="number" min="1" value={form.capacity} onChange={handleChange} required />
                </div>
              </div>

              <div className="booking-edit-footer">
                <button type="button" className="btn" onClick={closeModal} disabled={saving}>Cancel</button>
                <button type="submit" className="btn primary" disabled={saving}>
                  {saving ? 'Saving...' : editingKey ? 'Save Changes' : 'Add Schedule'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

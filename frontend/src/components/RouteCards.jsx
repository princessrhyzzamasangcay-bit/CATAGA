import { useEffect, useState } from 'react';
import { routes, routeLabel, scheduleRows, updateRoute, syncFleetConfig, ships } from '../data/fleetData';
import { useToast } from '../context/ToastContext';

const blankRoute = { from: '', to: '', frequency: 'Daily', fare: '0', vessel: '', duration: '', note: '' };
const routeFields = [
  ['from', 'Departure / From'],
  ['to', 'Destination / To'],
  ['frequency', 'Frequency / Operating Days'],
  ['fare', 'Passenger Fare (₱)'],
  ['vessel', 'Vessel'],
  ['duration', 'Travel Duration'],
  ['note', 'Route Notes / Port Details'],
];

export default function RouteCards({ editable = false }) {
  const showToast = useToast();
  const [, refreshRoutes] = useState(0);
  const [editingRoute, setEditingRoute] = useState(null);
  const [form, setForm] = useState(blankRoute);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    syncFleetConfig().finally(() => refreshRoutes((value) => value + 1));
    if (typeof window === 'undefined') return undefined;
    const refresh = () => refreshRoutes((value) => value + 1);
    window.addEventListener('route-fare-updated', refresh);
    window.addEventListener('schedule-updated', refresh);
    return () => {
      window.removeEventListener('route-fare-updated', refresh);
      window.removeEventListener('schedule-updated', refresh);
    };
  }, []);

  function openEdit(route) {
    setEditingRoute(routeLabel(route));
    setForm({ ...route, fare: String(route.fare).replace(/[₱,]/g, '') });
  }
  function closeEdit() {
    if (isSaving) return;
    setEditingRoute(null);
    setForm(blankRoute);
  }
  function changeField(event) {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  }
  async function handleSave(event) {
    event.preventDefault();
    setIsSaving(true);
    try {
      const updated = await updateRoute(editingRoute, form);
      console.log('ROUTE DETAILS UPDATED FROM ADMIN:', { route: routeLabel(updated), ...updated });
      showToast('All route details saved and synchronized.');
      setEditingRoute(null);
      refreshRoutes((value) => value + 1);
    } catch (error) {
      console.error('Route update failed:', error);
      showToast(error.message || 'Route could not be updated.');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <>
      <div className="section-title">Routes & fares</div>
      <p className="sub">Manage every route detail, including ports, frequency, fare, vessel, duration, and notes.</p>
      <div className="route-cards">
        {routes.map((route) => {
          const label = routeLabel(route);
          const matchingSchedules = scheduleRows.filter((schedule) => schedule.route === label);
          return (
            <div className="route-card" key={label}>
              <span className="port">MONTENEGRO · ROXAS AREA</span>
              <h4>⚓ {label}</h4>
              <div className="route-schedule-list" style={{ marginTop: 12 }}>
                <b>Available schedules</b>
                {matchingSchedules.length ? matchingSchedules.map((schedule) => (
                  <p key={schedule.id} style={{ margin: '6px 0', lineHeight: 1.6 }}>🕒 {schedule.time} · {schedule.days || 'Daily'} · {schedule.vessel} · <strong>₱{Number(schedule.fare ?? route.fare ?? 0).toLocaleString()} / passenger</strong> · {Math.max(0, Number(schedule.capacity || 0) - Number(schedule.booked || 0))} seats available</p>
                )) : <p style={{ margin: '6px 0' }}>No schedules currently available.</p>}
              </div>
            </div>
          );
        })}
      </div>

      {editable && editingRoute && <div className="booking-edit-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeEdit(); }}>
        <div className="booking-edit-modal route-fare-modal" role="dialog" aria-modal="true" aria-labelledby="edit-route-title">
          <div className="booking-edit-header">
            <div><span className="eyebrow">ROUTE DETAILS</span><h3 id="edit-route-title">Edit Route</h3><small>All fields below can be edited.</small></div>
            <button type="button" className="booking-edit-close" onClick={closeEdit} disabled={isSaving} aria-label="Close">×</button>
          </div>
          <form onSubmit={handleSave}>
            <div className="booking-edit-body">
              {routeFields.map(([name, label]) => <div className="booking-edit-field booking-edit-full" key={name}>
                <label htmlFor={`editRoute-${name}`}>{label}</label>
                {name === 'vessel' ? <select id={`editRoute-${name}`} name={name} value={form[name] || ''} onChange={changeField} required>
                  {[...new Set([form.vessel, ...ships.map((ship) => ship.name)].filter(Boolean))].map((vessel) => <option key={vessel} value={vessel}>{vessel}</option>)}
                </select> : <input id={`editRoute-${name}`} name={name} type={name === 'fare' ? 'number' : 'text'} min={name === 'fare' ? '0' : undefined} step={name === 'fare' ? '1' : undefined} value={form[name] ?? ''} onChange={changeField} required={['from', 'to', 'frequency', 'fare', 'vessel'].includes(name)} />}
              </div>)}
            </div>
            <div className="booking-edit-footer">
              <button type="button" className="btn" onClick={closeEdit} disabled={isSaving}>Cancel</button>
              <button type="submit" className="btn primary" disabled={isSaving}>{isSaving ? 'Saving...' : 'Save All Changes'}</button>
            </div>
          </form>
        </div>
      </div>}
    </>
  );
}

import { API_BASE } from '../config';
// Routes and schedules are based on publicly available 2026 references.
// Ferry schedules can change because of weather, operations, or port advisories.
// The booking UI treats these times as the current configured/indicative schedule.

export const ships = [
  {
    name: 'MV Reina del Cielo',
    type: 'RoRo Passenger',
    capacity: '738 pax',
    status: 'Operational',
    routes: ['Roxas, Oriental Mindoro → Caticlan, Malay, Aklan'],
  },
  {
    name: 'MV Reina Genoveva',
    type: 'RoRo Passenger',
    capacity: '584 pax',
    status: 'Operational',
    routes: ['Roxas, Oriental Mindoro → Odiongan, Romblon'],
  },
];

export const routes = [
  {
    from: 'Roxas, Oriental Mindoro',
    to: 'Caticlan, Malay, Aklan',
    frequency: 'Daily',
    fare: '₱460',
    vessel: 'MV Reina del Cielo',
    duration: 'About 3–4 hours',
    note: 'Dangay / Port of Roxas to Caticlan area',
  },
  {
    from: 'Caticlan, Malay, Aklan',
    to: 'Roxas, Oriental Mindoro',
    frequency: 'Daily',
    fare: '₱460',
    vessel: 'MV Reina del Cielo',
    duration: 'About 3–4 hours',
    note: 'Caticlan to Dangay / Port of Roxas',
  },
  {
    from: 'Roxas, Oriental Mindoro',
    to: 'Odiongan, Romblon',
    frequency: 'Tuesday & Friday',
    fare: '₱870',
    vessel: 'MV Reina Genoveva',
    duration: 'About 2–3 hours',
    note: 'Dangay / Port of Roxas to Poctoy, Odiongan',
  },
  {
    from: 'Odiongan, Romblon',
    to: 'Roxas, Oriental Mindoro',
    frequency: 'Tuesday & Friday',
    fare: '₱870',
    vessel: 'MV Reina Genoveva',
    duration: 'About 2–3 hours',
    note: 'Poctoy, Odiongan to Dangay / Port of Roxas',
  },
];

const ORIGINAL_FARES = Object.fromEntries(routes.map((route) => [routeLabel(route), route.fare]));

const ROUTE_FARES_KEY = 'mt_route_fares';

function loadSavedRouteFares() {
  if (typeof window === 'undefined') return {};

  try {
    return JSON.parse(localStorage.getItem(ROUTE_FARES_KEY) || '{}');
  } catch {
    return {};
  }
}

function applySavedRouteFares() {
  const savedFares = loadSavedRouteFares();

  routes.forEach((route) => {
    const key = routeLabel(route);
    if (savedFares[key] !== undefined) {
      route.fare = `₱${Number(savedFares[key]).toLocaleString()}`;
    }
  });
}

applySavedRouteFares();

export async function syncFleetConfig() {
  try {
    const response = await fetch(`${API_BASE}/api/config`);
    const data = await response.json();
    if (!response.ok || !data.success) throw new Error('Could not load server configuration.');

    (data.removedRoutes || []).forEach((label) => {
      const index = routes.findIndex((item) => routeLabel(item) === label);
      if (index >= 0) routes.splice(index, 1);
    });

    (data.routes || []).forEach((saved) => {
      const route = routes.find((item) => routeLabel(item) === saved.key || routeLabel(item) === (saved.label || saved.key));
      if (route) Object.assign(route, { ...saved, fare: `₱${Number(saved.fare).toLocaleString()}` });
    });

    const removedScheduleKeys = new Set(data.removedSchedules || []);
    for (let index = scheduleRows.length - 1; index >= 0; index -= 1) {
      if (removedScheduleKeys.has(scheduleRows[index].id)) scheduleRows.splice(index, 1);
    }

    (data.schedules || []).forEach((saved) => {
      const row = scheduleRows.find((item) => scheduleKey(item) === saved.key);
      if (row) {
        Object.assign(row, saved);
      } else {
        scheduleRows.push({
          id: saved.key,
          time: saved.time || '',
          route: saved.route || '',
          vessel: saved.vessel || '',
          capacity: Number(saved.capacity) || 1,
          booked: Number(saved.booked) || 0,
          days: saved.days || 'Daily',
          fare: Number(saved.fare ?? routes.find((route) => routeLabel(route) === saved.route)?.fare?.toString().replace(/[₱,]/g, '') ?? 0),
        });
      }
    });

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('route-fare-updated'));
      window.dispatchEvent(new Event('schedule-updated'));
    }
    return data;
  } catch (error) {
    console.warn('Using local fleet configuration:', error.message);
    return null;
  }
}

export async function updateRoute(routeName, updates) {
  const route = routes.find((item) => routeLabel(item) === routeName);
  if (!route) throw new Error('Route not found.');

  const fare = Number(String(updates.fare ?? route.fare).replace(/[₱,]/g, ''));
  if (!Number.isFinite(fare) || fare < 0) throw new Error('Please enter a valid fare.');
  const from = String(updates.from ?? route.from).trim();
  const to = String(updates.to ?? route.to).trim();
  if (!from || !to) throw new Error('Departure and destination are required.');

  const payload = {
    key: routeName,
    label: `${from} → ${to}`,
    from,
    to,
    frequency: String(updates.frequency ?? route.frequency).trim(),
    fare,
    vessel: String(updates.vessel ?? route.vessel).trim(),
    duration: String(updates.duration ?? route.duration).trim(),
    note: String(updates.note ?? route.note).trim(),
  };

  const response = await fetch(`${API_BASE}/api/config/routes/${encodeURIComponent(routeName)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.success) throw new Error(data.message || 'Route could not be updated.');

  Object.assign(route, { ...payload, fare: `₱${fare.toLocaleString()}` });
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('route-fare-updated', { detail: { route: payload.label, routeData: route } }));
  }
  console.log('ROUTE UPDATED FROM ADMIN:', payload);
  return route;
}

export async function updateRouteFare(routeName, newFare) {
  const route = routes.find((item) => routeLabel(item) === routeName);
  if (!route) throw new Error('Route not found.');
  return updateRoute(routeName, { ...route, fare: newFare });
}

export async function deleteRoute(routeName) {
  const response = await fetch(`${API_BASE}/api/config/routes/${encodeURIComponent(routeName)}`, { method: 'DELETE' });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.success) throw new Error(data.message || 'Route could not be deleted.');
  const index = routes.findIndex((item) => routeLabel(item) === routeName);
  if (index >= 0) routes.splice(index, 1);
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('route-fare-updated'));
  console.log('ROUTE DELETED FROM SYSTEM:', { route: routeName });
  return data;
}

export function resetRouteFares() {
  routes.forEach((route) => {
    const original = ORIGINAL_FARES[routeLabel(route)];
    if (original !== undefined) route.fare = original;
  });

  if (typeof window !== 'undefined') {
    localStorage.removeItem(ROUTE_FARES_KEY);
    window.dispatchEvent(new Event('route-fare-updated'));
  }
}

const SCHEDULES_KEY = 'mt_schedule_rows';

function loadSavedSchedules() {
  if (typeof window === 'undefined') return {};

  try {
    return JSON.parse(localStorage.getItem(SCHEDULES_KEY) || '{}');
  } catch {
    return {};
  }
}

function scheduleKey(row) {
  return row.id || `${row.route}|${row.time}`;
}

function applySavedSchedules() {
  const saved = loadSavedSchedules();

  scheduleRows.forEach((row) => {
    const changes = saved[scheduleKey(row)];
    if (!changes) return;

    Object.assign(row, changes);
  });
}

export async function addSchedule(changes) {
  const nextTime = String(changes.time || '').trim();
  const nextRoute = String(changes.route || '').trim();
  const nextVessel = String(changes.vessel || '').trim();
  const nextDays = String(changes.days || '').trim();
  const nextCapacity = Number(changes.capacity);
  const nextFare = Number(String(changes.fare ?? 0).replace(/[₱,]/g, ''));

  if (!Number.isFinite(nextFare) || nextFare < 0) throw new Error('Fare must be a valid non-negative amount.');
  if (!nextTime || !nextRoute || !nextVessel || !nextDays) {
    throw new Error('Complete all schedule fields.');
  }
  if (!Number.isFinite(nextCapacity) || nextCapacity < 1) {
    throw new Error('Capacity must be a valid number.');
  }

  const response = await fetch(`${API_BASE}/api/config/schedules`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      time: nextTime,
      route: nextRoute,
      vessel: nextVessel,
      days: nextDays,
      capacity: nextCapacity,
      fare: nextFare,
      booked: 0,
    }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.success) {
    throw new Error(data.message || 'Schedule could not be added.');
  }

  const created = {
    id: data.schedule.key,
    time: data.schedule.time,
    route: data.schedule.route,
    vessel: data.schedule.vessel,
    days: data.schedule.days,
    capacity: Number(data.schedule.capacity),
    booked: Number(data.schedule.booked) || 0,
    fare: Number(data.schedule.fare ?? nextFare),
  };

  scheduleRows.push(created);

  if (typeof window !== 'undefined') {
    const saved = loadSavedSchedules();
    saved[created.id] = {
      time: created.time,
      route: created.route,
      vessel: created.vessel,
      days: created.days,
      capacity: created.capacity,
      fare: created.fare,
    };
    localStorage.setItem(SCHEDULES_KEY, JSON.stringify(saved));
    window.dispatchEvent(new CustomEvent('schedule-updated', { detail: { row: created } }));
  }

  return created;
}

export async function updateSchedule(originalKey, changes) {
  const row = scheduleRows.find(
    (item) => scheduleKey(item) === originalKey || `${item.route}|${item.time}` === originalKey
  );
  if (!row) throw new Error('Schedule not found.');

  // Always use the stable schedule ID when talking to the server.
  // The route/time text can change during editing, so it must not be the primary key.
  const stableKey = row.id || originalKey;

  const nextTime = String(changes.time || '').trim();
  const nextRoute = String(changes.route || '').trim();
  const nextVessel = String(changes.vessel || '').trim();
  const nextDays = String(changes.days || '').trim();
  const nextCapacity = Number(changes.capacity);
  const nextFare = Number(String(changes.fare ?? row.fare ?? 0).replace(/[₱,]/g, ''));

  if (!Number.isFinite(nextFare) || nextFare < 0) throw new Error('Fare must be a valid non-negative amount.');
  if (!nextTime || !nextRoute || !nextVessel || !nextDays) throw new Error('Complete all schedule fields.');
  if (!Number.isFinite(nextCapacity) || nextCapacity < 1) throw new Error('Capacity must be a valid number.');

  const response = await fetch(
    `${API_BASE}/api/config/schedules/${encodeURIComponent(stableKey)}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        time: nextTime,
        route: nextRoute,
        vessel: nextVessel,
        days: nextDays,
        capacity: nextCapacity,
        fare: nextFare,
      }),
    }
  );

  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.success) throw new Error(data.message || 'Schedule update failed.');

  Object.assign(row, data.schedule || { time: nextTime, route: nextRoute, vessel: nextVessel, days: nextDays, capacity: nextCapacity, fare: nextFare });
  if (typeof window !== 'undefined') {
    const saved = loadSavedSchedules();
    saved[stableKey] = { time: row.time, route: row.route, vessel: row.vessel, days: row.days, capacity: row.capacity, fare: row.fare };
    localStorage.setItem(SCHEDULES_KEY, JSON.stringify(saved));
    window.dispatchEvent(new CustomEvent('schedule-updated', { detail: { row } }));
  }
  return row;
}

export async function deleteSchedule(scheduleId) {
  const row = scheduleRows.find((item) => item.id === scheduleId);
  if (!row) throw new Error('Schedule not found.');
  const response = await fetch(`${API_BASE}/api/config/schedules/${encodeURIComponent(scheduleId)}`, { method: 'DELETE' });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.success) throw new Error(data.message || 'Schedule could not be deleted.');
  const index = scheduleRows.findIndex((item) => item.id === scheduleId);
  if (index >= 0) scheduleRows.splice(index, 1);
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('schedule-updated', { detail: { deletedId: scheduleId } }));
  return row;
}

export const scheduleTimes = [
  '04:00 AM',
  '10:00 AM',
  '08:00 PM',
  '02:00 AM',
  '06:00 AM',
  '02:00 PM',
  '06:00 PM',
  '10:00 PM',
];

export const scheduleRows = []; // Schedules are created by the admin and loaded from server configuration.

scheduleRows.forEach((row, index) => {
  row.id = row.id || `schedule-${index + 1}`;
});

applySavedSchedules();

export function fareNum(fare) {
  return parseInt(String(fare).replace(/[₱,]/g, '')) || 0;
}

export function routeLabel(r) {
  return `${r.from} → ${r.to}`;
}

export function getRoute(from, to) {
  return routes.find((route) => route.from === from && route.to === to) || null;
}

function dayName(date) {
  if (!date) return '';
  return new Intl.DateTimeFormat('en-US', { weekday: 'long' }).format(
    new Date(`${date}T12:00:00`)
  );
}

export function getScheduleRows(route, date) {
  if (!route || !date) return [];

  const weekday = dayName(date);
  const matching = scheduleRows.filter((row) => row.route === routeLabel(route));

  return matching.filter((row) => {
    if (!row.days || row.days.toLowerCase() === 'daily') return true;
    return row.days
      .split(/[&,]/)
      .map((day) => day.trim())
      .some((day) => day.toLowerCase() === weekday.toLowerCase());
  });
}

export function getSchedules(route, date) {
  return getScheduleRows(route, date).map((row) => row.time);
}


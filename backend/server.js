import express from "express";
import cors from "cors";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import mysql from "mysql2/promise";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT || process.env.BACKEND_PORT || 8080);
const HOST = "0.0.0.0";
const distPath = path.join(__dirname, "..", "frontend", "dist");

/* ------------------------------------------------------------------ */
/* MySQL (XAMPP defaults: root, no password, port 3306)                */
/* ------------------------------------------------------------------ */
const db = mysql.createPool({
  host: process.env.DB_HOST || "localhost",
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "",
   database: process.env.DB_NAME || "montenegro",
  waitForConnections: true,
  connectionLimit: 10,
  dateStrings: true, // DATE columns come back as "YYYY-MM-DD" strings
});

// Real connection test (db.getConnection() alone returns a Promise = always truthy)
try {
  const conn = await db.getConnection();
  conn.release();
  console.log("Database Connected");
} catch (error) {
  console.error("Database connection FAILED:", error.message);
  console.error("Check: XAMPP MySQL is started, database exists, credentials are correct.");
}

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */
class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// Forwards async errors to the Express error handler (no more hanging requests)
const wrap = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

async function withTransaction(fn) {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}

// MariaDB (XAMPP) returns JSON columns as strings; MySQL 8 returns objects.
function parseJson(value, fallback) {
  if (value == null) return fallback;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function makeId(prefix = "MT") {
  return `${prefix}-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 7)
    .toUpperCase()}`;
}

const round2 = (n) => Math.round(n * 100) / 100;

const DISCOUNT_RATES = {
  Regular: 0,
  PWD: 0.2,
  "Senior Citizen": 0.2,
  Child: 0.5,
};

/* ---------- row <-> object mappers (keep the same JSON shape as before) ---------- */
function mapRoute(row) {
  return {
    ...parseJson(row.extra, {}),
    key: row.route_key,
    label: row.label,
    fare: Number(row.fare),
  };
}

function mapSchedule(row) {
  return {
    key: row.schedule_key,
    time: row.time,
    route: row.route,
    vessel: row.vessel,
    days: row.days,
    capacity: Number(row.capacity),
    fare: Number(row.fare),
    booked: Number(row.booked),
  };
}

const BOOKING_KEYS = [
  "id", "userId", "name", "contact", "route", "date", "schedule",
  "scheduleKey", "vessel", "qty", "fare", "amount", "payment", "paid",
  "status", "passengers", "fareBreakdown", "createdAt", "updatedAt",
];

function mapBooking(row) {
  const booking = {
    ...parseJson(row.extra, {}),
    id: row.id,
    name: row.name,
    contact: row.contact,
    route: row.route,
    date: row.travel_date,
    schedule: row.schedule,
    scheduleKey: row.schedule_key,
    vessel: row.vessel,
    qty: Number(row.qty),
    fare: Number(row.fare),
    amount: Number(row.amount),
    payment: row.payment,
    paid: Boolean(row.paid),
    status: row.status,
    fareBreakdown: parseJson(row.fare_breakdown, []),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };

  if (row.user_id != null) booking.userId = row.user_id;
  const passengers = parseJson(row.passengers, null);
  if (passengers) booking.passengers = passengers;

  return booking;
}

function bookingToRow(b) {
  // Any extra fields the frontend sends are kept in the `extra` JSON column.
  const extra = Object.fromEntries(
    Object.entries(b).filter(([key]) => !BOOKING_KEYS.includes(key))
  );

  return {
    id: b.id,
    user_id: b.userId ?? null,
    name: b.name,
    contact: b.contact,
    route: b.route,
    travel_date: b.date,
    schedule: b.schedule,
    schedule_key: b.scheduleKey ?? null,
    vessel: b.vessel ?? null,
    qty: b.qty,
    fare: b.fare,
    amount: b.amount,
    payment: b.payment ?? null,
    paid: b.paid ? 1 : 0,
    status: b.status,
    passengers: b.passengers ? JSON.stringify(b.passengers) : null,
    fare_breakdown: JSON.stringify(b.fareBreakdown || []),
    extra: JSON.stringify(extra),
    created_at: b.createdAt,
    updated_at: b.updatedAt,
  };
}

/* ---------- lookups ---------- */
async function findRoute(conn, routeLabel) {
  const [rows] = await conn.query(
    "SELECT * FROM routes WHERE label = ? OR route_key = ? LIMIT 1",
    [routeLabel, routeLabel]
  );
  return rows[0] ? mapRoute(rows[0]) : null;
}

// lock = true -> SELECT ... FOR UPDATE (prevents two people taking the last seat)
async function findSchedule(conn, booking, lock = false) {
  const suffix = lock ? " FOR UPDATE" : "";
  const [rows] = booking.scheduleKey
    ? await conn.query(
        `SELECT * FROM schedules WHERE schedule_key = ?${suffix}`,
        [booking.scheduleKey]
      )
    : await conn.query(
        `SELECT * FROM schedules WHERE route = ? AND \`time\` = ? LIMIT 1${suffix}`,
        [booking.route, booking.schedule]
      );

  return rows[0] ? mapSchedule(rows[0]) : null;
}

async function changeScheduleBooked(conn, scheduleKey, delta) {
  if (!scheduleKey) return;
  await conn.query(
    "UPDATE schedules SET booked = GREATEST(0, booked + ?) WHERE schedule_key = ?",
    [Number(delta) || 0, scheduleKey]
  );
}

async function getScheduleByKey(conn, key) {
  const [rows] = await conn.query(
    "SELECT * FROM schedules WHERE schedule_key = ?",
    [key]
  );
  return rows[0] ? mapSchedule(rows[0]) : null;
}

function isBookingActive(status) {
  return String(status || "Pending").toLowerCase() !== "cancelled";
}

function scheduleMatchesDate(schedule, date) {
  if (!schedule || !date) return false;
  if (!schedule.days || String(schedule.days).toLowerCase() === "daily") {
    return true;
  }

  const day = new Intl.DateTimeFormat("en-US", { weekday: "long" }).format(
    new Date(`${date}T12:00:00`)
  );

  return String(schedule.days)
    .split(/[&,]/)
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean)
    .includes(day.toLowerCase());
}

function buildFareBreakdown(passengerList, qty, baseFare, { strict = false } = {}) {
  return Array.from({ length: qty }, (_, index) => {
    const passenger = passengerList[index] || {};
    const type = Object.hasOwn(DISCOUNT_RATES, passenger.discountType)
      ? passenger.discountType
      : "Regular";
    const age = Number(passenger.age || 0);

    if (strict) {
      if (type === "Senior Citizen" && age < 60) {
        throw new HttpError(400, "Senior Citizen discount requires age 60 or older.");
      }
      if (type === "Child" && age > 11) {
        throw new HttpError(400, "Child discount is only for ages 11 and below.");
      }
      if (type === "PWD" && !String(passenger.pwdId || passenger.discountIdReference || "").trim()) {
        throw new HttpError(400, "PWD ID/reference is required for the PWD discount.");
      }
    }

    const discountAmount = round2(baseFare * DISCOUNT_RATES[type]);

    return {
      name: String(passenger.name || ""),
      age,
      discountType: type,
      discountPercent: Math.round(DISCOUNT_RATES[type] * 100),
      discountIdType:
        passenger.discountIdType ||
        (type === "PWD"
          ? "PWD ID"
          : type === "Senior Citizen"
            ? "Senior Citizen ID"
            : type === "Child"
              ? "Proof of age"
              : ""),
      discountIdReference:
        passenger.discountIdReference || passenger.pwdId || passenger.seniorId || "",
      baseFare,
      discountAmount,
      finalFare: round2(baseFare - discountAmount),
    };
  });
}

/* ---------- console printing ---------- */
function printLine(char = "-", length = 62) {
  console.log(char.repeat(length));
}

function printSection(title) {
  console.log(`\n+${"=".repeat(60)}+`);
  console.log(`| ${title.padEnd(58)} |`);
  console.log(`+${"=".repeat(60)}+`);
}

function printBookingSummary(booking) {
  console.log(`  Booking ID : ${booking.id}`);
  console.log(`  Passenger  : ${booking.name || "-"}`);
  console.log(`  Route      : ${booking.route || "-"}`);
  console.log(`  Date       : ${booking.date || "-"}`);
  console.log(`  Schedule   : ${booking.schedule || "-"}`);
  console.log(`  Passengers : ${booking.qty || 1}`);
  console.log(`  Amount     : ₱${Number(booking.amount || 0).toLocaleString()}`);
  console.log(`  Payment    : ${booking.payment || "-"}`);
  console.log(`  Status     : ${booking.status || "Pending"}`);
}

app.use((req, res, next) => {
  if (req.method === "POST" && req.path === "/api/bookings") {
    printSection("NEW BOOKING RECEIVED");
    console.log("  Method     : POST /api/bookings");
    console.log(`  Passenger  : ${req.body?.name || "-"}`);
    console.log(`  Route      : ${req.body?.route || "-"}`);
    console.log(`  Travel Date: ${req.body?.date || "-"}`);
    console.log(`  Schedule   : ${req.body?.schedule || "-"}`);
    printLine();
  }
  next();
});

/* ------------------------------------------------------------------ */
/* Health                                                              */
/* ------------------------------------------------------------------ */
app.get("/api/health", wrap(async (req, res) => {
  await db.query("SELECT 1");
  res.json({
    ok: true,
    database: "connected",
    message: "Montenegro Lines Backend is running.",
  });
}));

/* ------------------------------------------------------------------ */
/* CONFIG: routes + schedules                                          */
/* ------------------------------------------------------------------ */
app.get("/api/config", wrap(async (req, res) => {
  const [routes] = await db.query("SELECT * FROM routes ORDER BY seq");
  const [schedules] = await db.query("SELECT * FROM schedules ORDER BY seq");
  const [removed] = await db.query("SELECT kind, item_key FROM removed_config");

  res.json({
    success: true,
    routes: routes.map(mapRoute),
    schedules: schedules.map(mapSchedule),
    removedRoutes: removed.filter((r) => r.kind === "route").map((r) => r.item_key),
    removedSchedules: removed.filter((r) => r.kind === "schedule").map((r) => r.item_key),
  });
}));

// Create or update a route (UPSERT)
app.patch("/api/config/routes/:routeKey", wrap(async (req, res) => {
  const routeKey = req.params.routeKey;

  const [rows] = await db.query("SELECT * FROM routes WHERE route_key = ?", [routeKey]);
  const current = rows[0] ? mapRoute(rows[0]) : {};
  const merged = { ...current, ...req.body, key: routeKey };
  const { key, label, fare, ...extra } = merged;

  await db.query(
    `INSERT INTO routes (route_key, label, fare, extra) VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE label = VALUES(label), fare = VALUES(fare), extra = VALUES(extra)`,
    [routeKey, label || routeKey, Number(fare) || 0, JSON.stringify(extra)]
  );
  await db.query(
    "DELETE FROM removed_config WHERE kind = 'route' AND item_key = ?",
    [routeKey]
  );

  const [saved] = await db.query("SELECT * FROM routes WHERE route_key = ?", [routeKey]);
  const next = mapRoute(saved[0]);

  printSection("ROUTE UPDATED");
  console.log(`  Route      : ${next.label || routeKey}`);
  console.log(`  Fare       : ₱${Number(next.fare || 0).toLocaleString()}`);
  printLine();

  res.json({ success: true, route: next });
}));

app.delete("/api/config/routes/:routeKey", wrap(async (req, res) => {
  const key = req.params.routeKey; // Express already decodes it

  await withTransaction(async (conn) => {
    const route = await findRoute(conn, key);
    if (!route) {
      throw new HttpError(404, "Route not found in server configuration.");
    }

    await conn.query(
      "DELETE FROM schedules WHERE route IN (?, ?, ?)",
      [key, route.key, route.label]
    );
    await conn.query("DELETE FROM routes WHERE route_key = ?", [route.key]);

    for (const k of new Set([key, route.key].filter(Boolean))) {
      await conn.query(
        "INSERT IGNORE INTO removed_config (kind, item_key) VALUES ('route', ?)",
        [k]
      );
    }
  });

  printSection("ROUTE DELETED");
  console.log(`  Route      : ${key}`);
  console.log("  Result     : Route removed from route options and schedules.");
  printLine();

  res.json({ success: true, route: key });
}));

app.post("/api/config/schedules", wrap(async (req, res) => {
  const body = req.body || {};

  if (
    !body.time ||
    !body.route ||
    !body.vessel ||
    !body.days ||
    !Number(body.capacity) ||
    !Number.isFinite(Number(body.fare)) ||
    Number(body.fare) < 0
  ) {
    throw new HttpError(400, "Please complete all schedule fields.");
  }

  const schedule = {
    key: body.key || `schedule-${Date.now()}`,
    time: String(body.time).trim(),
    route: String(body.route).trim(),
    vessel: String(body.vessel).trim(),
    days: String(body.days).trim(),
    capacity: Number(body.capacity),
    fare: Number(body.fare),
    booked: Math.max(0, Number(body.booked) || 0),
  };

  if (schedule.booked > schedule.capacity) {
    throw new HttpError(400, "Booked seats cannot exceed schedule capacity.");
  }

  await db.query(
    `INSERT INTO schedules (schedule_key, \`time\`, route, vessel, days, capacity, fare, booked)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [schedule.key, schedule.time, schedule.route, schedule.vessel,
     schedule.days, schedule.capacity, schedule.fare, schedule.booked]
  );
  await db.query(
    "DELETE FROM removed_config WHERE kind = 'schedule' AND item_key = ?",
    [schedule.key]
  );

  printSection("SCHEDULE ADDED");
  console.log(`  Schedule   : ${schedule.time}`);
  console.log(`  Route      : ${schedule.route}`);
  console.log(`  Vessel     : ${schedule.vessel}`);
  console.log(`  Days       : ${schedule.days}`);
  console.log(`  Capacity   : ${schedule.capacity}`);
  console.log(`  Available  : ${schedule.capacity - schedule.booked}`);
  console.log(`  Fare       : ₱${schedule.fare.toLocaleString()}`);
  printLine();

  res.status(201).json({ success: true, schedule });
}));

app.patch("/api/config/schedules/:scheduleKey", wrap(async (req, res) => {
  const current = await getScheduleByKey(db, req.params.scheduleKey);
  if (!current) throw new HttpError(404, "Schedule not found.");

  const next = {
    ...current,
    ...req.body,
    key: current.key,
    booked: Number(current.booked || 0),
    capacity: Number(req.body.capacity ?? current.capacity),
    fare: Number(req.body.fare ?? current.fare ?? 0),
  };

  if (
    !next.time ||
    !next.route ||
    !next.vessel ||
    !next.days ||
    !Number(next.capacity) ||
    !Number.isFinite(next.fare) ||
    next.fare < 0
  ) {
    throw new HttpError(400, "Please complete all schedule fields.");
  }

  if (next.capacity < next.booked) {
    throw new HttpError(400, `Capacity cannot be lower than ${next.booked} booked seats.`);
  }

  await db.query(
    `UPDATE schedules
     SET \`time\` = ?, route = ?, vessel = ?, days = ?, capacity = ?, fare = ?
     WHERE schedule_key = ?`,
    [next.time, next.route, next.vessel, next.days, next.capacity, next.fare, current.key]
  );

  printSection("SCHEDULE UPDATED");
  console.log(`  Schedule   : ${next.time}`);
  console.log(`  Route      : ${next.route}`);
  console.log(`  Vessel     : ${next.vessel}`);
  console.log(`  Days       : ${next.days}`);
  console.log(`  Capacity   : ${next.capacity}`);
  console.log(`  Available  : ${next.capacity - next.booked}`);
  console.log(`  Fare       : ₱${next.fare.toLocaleString()}`);
  printLine();

  res.json({ success: true, schedule: next });
}));

app.delete("/api/config/schedules/:scheduleKey", wrap(async (req, res) => {
  const key = req.params.scheduleKey;

  const removed = await withTransaction(async (conn) => {
    const schedule = await getScheduleByKey(conn, key);
    if (!schedule) throw new HttpError(404, "Schedule not found.");

    await conn.query("DELETE FROM schedules WHERE schedule_key = ?", [key]);
    await conn.query(
      "INSERT IGNORE INTO removed_config (kind, item_key) VALUES ('schedule', ?)",
      [key]
    );
    return schedule;
  });

  printSection("SCHEDULE DELETED");
  console.log(`  Schedule   : ${removed.time || "-"}`);
  console.log(`  Route      : ${removed.route || "-"}`);
  console.log(`  Vessel     : ${removed.vessel || "-"}`);
  console.log("  Result     : Schedule removed from passenger trip options.");
  printLine();

  res.json({ success: true, schedule: removed });
}));

/* ------------------------------------------------------------------ */
/* BOOKINGS                                                            */
/* ------------------------------------------------------------------ */

// CREATE
app.post("/api/bookings", wrap(async (req, res) => {
  const body = req.body || {};

  if (!body.name || !body.contact || !body.route || !body.date || !body.schedule) {
    throw new HttpError(400, "Please complete all required booking fields.");
  }

  const qty = Math.max(1, Math.floor(Number(body.qty) || 1));

  const { booking, seatsLeft } = await withTransaction(async (conn) => {
    const route = await findRoute(conn, body.route);
    if (!route) throw new HttpError(400, "Selected route is no longer available.");

    const schedule = await findSchedule(conn, body, true);
    if (!schedule) throw new HttpError(400, "Selected schedule is no longer available.");

    if (!scheduleMatchesDate(schedule, body.date)) {
      throw new HttpError(400, "Selected schedule is not available on this date.");
    }

    const availableSeats = Math.max(0, schedule.capacity - schedule.booked);
    if (qty > availableSeats) {
      throw new HttpError(409, `Only ${availableSeats} seat(s) are available for this schedule.`);
    }

    const scheduleFare = Number(schedule.fare ?? route.fare ?? 0);
    const passengerList = Array.isArray(body.passengers) ? body.passengers : [];
    const fareBreakdown = buildFareBreakdown(passengerList, qty, scheduleFare, { strict: true });
    const amount = round2(fareBreakdown.reduce((sum, item) => sum + item.finalFare, 0));
    const now = new Date().toISOString();

    const newBooking = {
      ...body,
      fareBreakdown,
      id: body.id || makeId("MT"),
      qty,
      amount,
      fare: scheduleFare,
      route: route.label || route.key,
      schedule: schedule.time,
      scheduleKey: schedule.key,
      vessel: schedule.vessel,
      paid: Boolean(body.paid),
      status: "Pending",
      createdAt: body.createdAt || now,
      updatedAt: now,
    };

    await conn.query("INSERT INTO bookings SET ?", [bookingToRow(newBooking)]);
    await changeScheduleBooked(conn, schedule.key, qty);

    return { booking: newBooking, seatsLeft: availableSeats - qty };
  });

  printSection("BOOKING SAVED SUCCESSFULLY");
  printBookingSummary(booking);
  console.log(`  Seats Left : ${seatsLeft}`);
  printLine();

  res.status(201).json({
    success: true,
    message: "Booking received by Express backend.",
    booking,
  });
}));

// READ (all, or filtered by ?userId=)
app.get("/api/bookings", wrap(async (req, res) => {
  const [rows] = req.query.userId
    ? await db.query(
        "SELECT * FROM bookings WHERE user_id = ? ORDER BY seq DESC",
        [req.query.userId]
      )
    : await db.query("SELECT * FROM bookings ORDER BY seq DESC");

  res.json(rows.map(mapBooking));
}));

// UPDATE
app.patch("/api/bookings/:id", wrap(async (req, res) => {
  const body = req.body || {};

  let result;
  try {
    result = await withTransaction(async (conn) => {
      const [rows] = await conn.query(
        "SELECT * FROM bookings WHERE id = ? FOR UPDATE",
        [req.params.id]
      );
      if (!rows[0]) throw new HttpError(404, "Booking not found.");

      const previous = mapBooking(rows[0]);
      const next = { ...previous, ...body, id: previous.id };

      // If the route/time changed without a new scheduleKey, look the schedule up
      // by route + time instead of sticking to the old scheduleKey.
      if (!("scheduleKey" in body) && ("schedule" in body || "route" in body)) {
        delete next.scheduleKey;
      }

      const route = await findRoute(conn, next.route);
      if (!route) throw new HttpError(400, "Selected route is no longer available.");

      const schedule = await findSchedule(conn, next, true);
      if (!schedule) throw new HttpError(400, "Selected schedule is no longer available.");

      if (!scheduleMatchesDate(schedule, next.date)) {
        throw new HttpError(400, "Selected schedule is not available on this date.");
      }

      const oldQty = Math.max(1, Number(previous.qty) || 1);
      const newQty = Math.max(1, Math.floor(Number(next.qty) || 1));
      const oldActive = isBookingActive(previous.status);
      const newActive = isBookingActive(next.status);
      const oldSchedule = await findSchedule(conn, previous);
      const oldScheduleKey = oldSchedule?.key;
      const sameSchedule = oldScheduleKey === schedule.key;

      if (newActive) {
        const seatsAlreadyHeld = sameSchedule && oldActive ? oldQty : 0;
        const seatsAvailableForEdit = Math.max(
          0,
          schedule.capacity - schedule.booked + seatsAlreadyHeld
        );

        if (newQty > seatsAvailableForEdit) {
          throw new HttpError(409, `Only ${seatsAvailableForEdit} seat(s) are available for this schedule.`);
        }
      }

      if (oldActive) await changeScheduleBooked(conn, oldScheduleKey, -oldQty);
      if (newActive) await changeScheduleBooked(conn, schedule.key, newQty);

      next.qty = newQty;
      next.fare = Number(schedule.fare ?? route.fare ?? 0);
      next.route = route.label || route.key;
      next.schedule = schedule.time;
      next.scheduleKey = schedule.key;
      next.vessel = schedule.vessel;

      const passengerList =
        Array.isArray(next.passengers) && next.passengers.length
          ? next.passengers
          : (Array.isArray(previous.fareBreakdown) ? previous.fareBreakdown : []).map(
              (item) => ({
                name: item.name,
                age: item.age,
                discountType: item.discountType || "Regular",
                discountIdType: item.discountIdType,
                discountIdReference: item.discountIdReference || "",
                pwdId: item.pwdId || item.discountIdReference || "",
                seniorId: item.seniorId || item.discountIdReference || "",
              })
            );

      next.fareBreakdown = buildFareBreakdown(passengerList, newQty, next.fare);
      next.amount = round2(next.fareBreakdown.reduce((sum, item) => sum + item.finalFare, 0));
      next.updatedAt = new Date().toISOString();

      const row = bookingToRow(next);
      delete row.id;
      delete row.created_at; // never overwrite creation time
      await conn.query("UPDATE bookings SET ? WHERE id = ?", [row, previous.id]);

      const updatedSchedule = await getScheduleByKey(conn, schedule.key);
      return { previous, next, updatedSchedule };
    });
  } catch (error) {
    if (error instanceof HttpError && error.status === 404) {
      printSection("BOOKING UPDATE FAILED");
      console.log(`  Booking ID : ${req.params.id}`);
      console.log("  Reason     : Booking not found.");
      printLine();
    }
    throw error;
  }

  const { previous, next, updatedSchedule } = result;

  printSection("BOOKING UPDATED");
  console.log(`  Method     : PATCH /api/bookings/${req.params.id}`);
  console.log(`  Booking ID : ${next.id}`);
  printLine("-", 62);

  const fields = [
    ["Passenger", "name"], ["Contact", "contact"], ["Route", "route"],
    ["Date", "date"], ["Schedule", "schedule"], ["Passengers", "qty"],
    ["Amount", "amount"], ["Payment", "payment"], ["Status", "status"],
    ["Paid", "paid"], ["Vessel", "vessel"],
  ];

  let changed = false;
  for (const [label, key] of fields) {
    if (JSON.stringify(previous[key]) !== JSON.stringify(next[key])) {
      changed = true;
      const before = previous[key] ?? "-";
      const after = next[key] ?? "-";
      const beforeText = key === "amount" ? `₱${Number(before || 0).toLocaleString()}` : String(before);
      const afterText = key === "amount" ? `₱${Number(after || 0).toLocaleString()}` : String(after);
      console.log(`  ${label.padEnd(11)}: ${beforeText}  →  ${afterText}`);
    }
  }
  if (!changed) console.log("  No field values changed.");

  console.log();
  console.log("  UPDATED BOOKING");
  printLine("-", 62);
  printBookingSummary(next);
  if (updatedSchedule) {
    console.log(`  Seats Left : ${Math.max(0, updatedSchedule.capacity - updatedSchedule.booked)}`);
  }
  printLine();

  res.json({ success: true, booking: next });
}));

// DELETE
app.delete("/api/bookings/:id", wrap(async (req, res) => {
  const booking = await withTransaction(async (conn) => {
    const [rows] = await conn.query(
      "SELECT * FROM bookings WHERE id = ? FOR UPDATE",
      [req.params.id]
    );
    if (!rows[0]) throw new HttpError(404, "Booking not found.");

    const found = mapBooking(rows[0]);
    const schedule = await findSchedule(conn, found, true);

    if (schedule && isBookingActive(found.status)) {
      await changeScheduleBooked(conn, schedule.key, -Math.max(1, Number(found.qty) || 1));
    }

    await conn.query("DELETE FROM bookings WHERE id = ?", [found.id]);
    return found;
  });

  printSection("BOOKING DELETED");
  printBookingSummary(booking);
  console.log("  Result     : Booking removed; seats released.");
  printLine();

  res.json({ success: true, id: booking.id });
}));

app.get("/api/stats", wrap(async (req, res) => {
  const [[row]] = await db.query(
    `SELECT COUNT(*) AS total,
            SUM(status = 'Pending')   AS pending,
            SUM(status = 'Confirmed') AS confirmed,
            SUM(status = 'Cancelled') AS cancelled
     FROM bookings`
  );

  res.json({
    totalBookings: Number(row.total || 0),
    pendingBookings: Number(row.pending || 0),
    confirmedBookings: Number(row.confirmed || 0),
    cancelledBookings: Number(row.cancelled || 0),
  });
}));

/* ------------------------------------------------------------------ */
/* Frontend / fallbacks                                                */
/* ------------------------------------------------------------------ */
app.use("/api", (req, res) => {
  res.status(404).json({ success: false, message: "API endpoint not found." });
});

if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));

  app.use((req, res, next) => {
    if (req.method === "GET") {
      return res.sendFile(path.join(distPath, "index.html"));
    }
    next();
  });
} else {
  // Only used when there is no built frontend (it used to be unreachable at the bottom)
  app.get("/", (req, res) => {
    res.status(200).send(`
      <!DOCTYPE html>
      <html lang="en">
        <head>
          <meta charset="UTF-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
          <title>Montenegro Lines API</title>
        </head>
        <body>
          <h1>Montenegro Lines Backend is Running!</h1>
          <p>The backend server is online.</p>
          <p>Health check: <a href="/api/health">/api/health</a></p>
        </body>
      </html>
    `);
  });
}

/* ------------------------------------------------------------------ */
/* Error handler (must be after all routes)                            */
/* ------------------------------------------------------------------ */
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);

  if (err instanceof HttpError) {
    return res.status(err.status).json({ success: false, message: err.message });
  }
  if (err.type === "entity.parse.failed") {
    return res.status(400).json({ success: false, message: "Invalid JSON body." });
  }
  if (err.code === "ER_DUP_ENTRY") {
    return res.status(409).json({ success: false, message: "Record already exists." });
  }

  console.error("Express error:", err);
  res.status(500).json({
    success: false,
    message: "Internal server error.",
    // Debug info: remove before deploying
    detail: err.code ? `${err.code}: ${err.sqlMessage || err.message}` : err.message,
  });
});

app.listen(PORT, HOST, () => {
  printSection("MONTENEGRO LINES BACKEND");
  console.log(`  Port       : ${PORT}`);
  console.log(`  Host       : ${HOST}`);
  console.log(`  Local      : http://localhost:${PORT}`);
  console.log(`  Health     : http://localhost:${PORT}/api/health`);
  console.log("  Database   : MySQL (XAMPP)");
  console.log("  Bookings   : POST /api/bookings");
  console.log("  Updates    : PATCH /api/bookings/:id");
  console.log("  Deletes    : DELETE /api/bookings/:id");
  console.log("  Status     : New bookings start as PENDING");
  printLine();

  if (!fs.existsSync(distPath)) {
    console.log("  Note       : Frontend dist/ not found.");
    console.log("  Info       : Backend API can still run independently.");
    printLine();
  }
});
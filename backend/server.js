
import express from "express";
import cors from "cors";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT || process.env.BACKEND_PORT || 8080);
const HOST = "0.0.0.0";

const distPath = path.join(__dirname, "..", "frontend", "dist");
const dataDir = path.join(__dirname, "server-data");
const bookingsFile = path.join(dataDir, "bookings.json");
const usersFile = path.join(dataDir, "users.json");
const configFile = path.join(dataDir, "system-config.json");

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

function ensureDataFile(file, initialValue = []) {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  if (!fs.existsSync(file)) {
    writeJson(file, initialValue);
  }
}

function readJson(file, fallback = []) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    console.error(`Unable to read ${path.basename(file)}:`, error.message);
    return fallback;
  }
}

function writeJson(file, value) {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  fs.writeFileSync(file, JSON.stringify(value, null, 2) + "\n", "utf8");
}

ensureDataFile(bookingsFile, []);
ensureDataFile(usersFile, []);
ensureDataFile(configFile, { routes: [], schedules: [] });

function makeId(prefix = "MT") {
  return `${prefix}-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 7)
    .toUpperCase()}`;
}

function routeForBooking(config, routeLabel) {
  return (config.routes || []).find(
    (route) => (route.label || route.key) === routeLabel || route.key === routeLabel
  );
}

function scheduleForBooking(config, booking) {
  const schedules = Array.isArray(config.schedules) ? config.schedules : [];

  return schedules.find((schedule) =>
    booking.scheduleKey
      ? schedule.key === booking.scheduleKey
      : schedule.route === booking.route && schedule.time === booking.schedule
  );
}

function scheduleMatchesDate(schedule, date) {
  if (!schedule || !date) return false;
  if (!schedule.days || String(schedule.days).toLowerCase() === "daily") {
    return true;
  }

  const day = new Intl.DateTimeFormat("en-US", {
    weekday: "long",
  }).format(new Date(`${date}T12:00:00`));

  return String(schedule.days)
    .split(/[&,]/)
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean)
    .includes(day.toLowerCase());
}

function isBookingActive(status) {
  return String(status || "Pending").toLowerCase() !== "cancelled";
}

function changeScheduleBooked(config, scheduleKey, delta) {
  if (!scheduleKey) return;

  const schedule = (config.schedules || []).find(
    (item) => item.key === scheduleKey
  );

  if (!schedule) return;

  schedule.booked = Math.max(
    0,
    Number(schedule.booked || 0) + Number(delta || 0)
  );
}

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
  console.log(
    `  Amount     : ₱${Number(booking.amount || 0).toLocaleString()}`
  );
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

app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    message: "Montenegro Lines Backend is running.",
  });
});

app.get("/api/config", (req, res) => {
  res.json({
    success: true,
    ...readJson(configFile, { routes: [], schedules: [] }),
  });
});

app.patch("/api/config/routes/:routeKey", (req, res) => {
  const config = readJson(configFile, { routes: [], schedules: [] });
  const routes = Array.isArray(config.routes) ? config.routes : [];
  const routeKey = req.params.routeKey;

  const index = routes.findIndex((item) => item.key === routeKey);

  const next = {
    ...(index >= 0 ? routes[index] : {}),
    ...req.body,
    key: routeKey,
  };

  if (index >= 0) {
    routes[index] = next;
  } else {
    routes.push(next);
  }

  config.routes = routes;
  config.removedRoutes = (config.removedRoutes || []).filter(
    (key) => key !== routeKey
  );

  writeJson(configFile, config);

  printSection("ROUTE UPDATED");
  console.log(`  Route      : ${next.label || routeKey}`);
  console.log(`  Fare       : ₱${Number(next.fare || 0).toLocaleString()}`);
  printLine();

  res.json({ success: true, route: next });
});

// Delete a route.
app.delete("/api/config/routes/:routeKey", (req, res) => {
  const config = readJson(configFile, { routes: [], schedules: [] });
  const key = decodeURIComponent(req.params.routeKey);

  const route = (config.routes || []).find(
    (item) =>
      (item.label || item.key) === key || item.key === key
  );

  if (!route) {
    return res.status(404).json({
      success: false,
      message: "Route not found in server configuration.",
    });
  }

  config.routes = config.routes.filter((item) => item !== route);
  config.removedRoutes = [
    ...new Set([...(config.removedRoutes || []), key, route.key].filter(Boolean)),
  ];

  config.schedules = (config.schedules || []).filter(
    (item) => item.route !== key && item.route !== route.key && item.route !== route.label
  );

  writeJson(configFile, config);

  printSection("ROUTE DELETED");
  console.log(`  Route      : ${key}`);
  console.log("  Result     : Route removed from route options and schedules.");
  printLine();

  res.json({ success: true, route: key });
});

app.post("/api/config/schedules", (req, res) => {
  const config = readJson(configFile, { routes: [], schedules: [] });
  const schedules = Array.isArray(config.schedules) ? config.schedules : [];
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
    return res.status(400).json({
      success: false,
      message: "Please complete all schedule fields.",
    });
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
    return res.status(400).json({
      success: false,
      message: "Booked seats cannot exceed schedule capacity.",
    });
  }

  schedules.push(schedule);
  config.schedules = schedules;
  writeJson(configFile, config);

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
});

app.patch("/api/config/schedules/:scheduleKey", (req, res) => {
  const config = readJson(configFile, { routes: [], schedules: [] });
  const schedules = Array.isArray(config.schedules) ? config.schedules : [];
  const index = schedules.findIndex(
    (item) => item.key === req.params.scheduleKey
  );

  if (index === -1) {
    return res.status(404).json({
      success: false,
      message: "Schedule not found.",
    });
  }

  const current = schedules[index];
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
    return res.status(400).json({
      success: false,
      message: "Please complete all schedule fields.",
    });
  }

  if (next.capacity < next.booked) {
    return res.status(400).json({
      success: false,
      message: `Capacity cannot be lower than ${next.booked} booked seats.`,
    });
  }

  schedules[index] = next;
  config.schedules = schedules;
  writeJson(configFile, config);

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
});

app.delete("/api/config/schedules/:scheduleKey", (req, res) => {
  const config = readJson(configFile, { routes: [], schedules: [] });
  const key = decodeURIComponent(req.params.scheduleKey);
  const schedules = Array.isArray(config.schedules) ? config.schedules : [];
  const index = schedules.findIndex((item) => item.key === key);

  if (index < 0) {
    return res.status(404).json({
      success: false,
      message: "Schedule not found.",
    });
  }

  const [removed] = schedules.splice(index, 1);
  config.schedules = schedules;
  config.removedSchedules = [
    ...new Set([...(config.removedSchedules || []), key]),
  ];

  writeJson(configFile, config);

  printSection("SCHEDULE DELETED");
  console.log(`  Schedule   : ${removed.time || "-"}`);
  console.log(`  Route      : ${removed.route || "-"}`);
  console.log(`  Vessel     : ${removed.vessel || "-"}`);
  console.log("  Result     : Schedule removed from passenger trip options.");
  printLine();

  res.json({ success: true, schedule: removed });
});

app.post("/api/bookings", (req, res) => {
  const body = req.body || {};

  if (!body.name || !body.contact || !body.route || !body.date || !body.schedule) {
    return res.status(400).json({
      success: false,
      message: "Please complete all required booking fields.",
    });
  }

  const config = readJson(configFile, { routes: [], schedules: [] });
  const route = routeForBooking(config, body.route);
  const schedule = scheduleForBooking(config, body);
  const qty = Math.max(1, Math.floor(Number(body.qty) || 1));

  if (!route) {
    return res.status(400).json({
      success: false,
      message: "Selected route is no longer available.",
    });
  }

  if (!schedule) {
    return res.status(400).json({
      success: false,
      message: "Selected schedule is no longer available.",
    });
  }

  if (!scheduleMatchesDate(schedule, body.date)) {
    return res.status(400).json({
      success: false,
      message: "Selected schedule is not available on this date.",
    });
  }

  const availableSeats = Math.max(
    0,
    Number(schedule.capacity || 0) - Number(schedule.booked || 0)
  );

  if (qty > availableSeats) {
    return res.status(409).json({
      success: false,
      message: `Only ${availableSeats} seat(s) are available for this schedule.`,
    });
  }

  const scheduleFare = Number(schedule.fare ?? route.fare ?? 0);
  const discountRates = {
    Regular: 0,
    PWD: 0.2,
    "Senior Citizen": 0.2,
    Child: 0.5,
  };

  const passengerList = Array.isArray(body.passengers) ? body.passengers : [];

  const fareBreakdown = Array.from({ length: qty }, (_, index) => {
    const passenger = passengerList[index] || {};
    const type = Object.prototype.hasOwnProperty.call(
      discountRates,
      passenger.discountType
    )
      ? passenger.discountType
      : "Regular";

    const age = Number(passenger.age || 0);

    if (type === "Senior Citizen" && age < 60) {
      return {
        validationError: "Senior Citizen discount requires age 60 or older.",
      };
    }

    if (type === "Child" && age > 11) {
      return {
        validationError: "Child discount is only for ages 11 and below.",
      };
    }

    if (type === "PWD" && !String(passenger.pwdId || "").trim()) {
      return {
        validationError: "PWD ID/reference is required for the PWD discount.",
      };
    }

    const discountAmount = Math.round(scheduleFare * discountRates[type] * 100) / 100;

    return {
      name: String(passenger.name || ""),
      age,
      discountType: type,
      discountPercent: Math.round(discountRates[type] * 100),
      baseFare: scheduleFare,
      discountAmount,
      finalFare: Math.round((scheduleFare - discountAmount) * 100) / 100,
    };
  });

  const invalidDiscount = fareBreakdown.find((item) => item.validationError);

  if (invalidDiscount) {
    return res.status(400).json({
      success: false,
      message: invalidDiscount.validationError,
    });
  }

  const amount = Math.round(
    fareBreakdown.reduce((sum, item) => sum + item.finalFare, 0) * 100
  ) / 100;

  const bookings = readJson(bookingsFile, []);
  const booking = {
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
    createdAt: body.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  bookings.unshift(booking);
  changeScheduleBooked(config, schedule.key, qty);

  writeJson(bookingsFile, bookings);
  writeJson(configFile, config);

  printSection("BOOKING SAVED SUCCESSFULLY");
  printBookingSummary(booking);
  console.log(
    `  Seats Left : ${Math.max(0, Number(schedule.capacity) - Number(schedule.booked))}`
  );
  printLine();

  res.status(201).json({
    success: true,
    message: "Booking received by Express backend.",
    booking,
  });
});

app.get("/api/bookings", (req, res) => {
  let bookings = readJson(bookingsFile, []);

  if (req.query.userId) {
    bookings = bookings.filter((booking) => booking.userId === req.query.userId);
  }

  res.json(bookings);
});

app.patch("/api/bookings/:id", (req, res) => {
  const bookings = readJson(bookingsFile, []);
  const index = bookings.findIndex((booking) => booking.id === req.params.id);

  if (index === -1) {
    printSection("BOOKING UPDATE FAILED");
    console.log(`  Booking ID : ${req.params.id}`);
    console.log("  Reason     : Booking not found.");
    printLine();

    return res.status(404).json({
      success: false,
      message: "Booking not found.",
    });
  }

  const previousBooking = { ...bookings[index] };
  const config = readJson(configFile, { routes: [], schedules: [] });
  const next = { ...previousBooking, ...req.body, id: previousBooking.id };

  const route = routeForBooking(config, next.route);
  const schedule = scheduleForBooking(config, next);

  if (!route) {
    return res.status(400).json({
      success: false,
      message: "Selected route is no longer available.",
    });
  }

  if (!schedule) {
    return res.status(400).json({
      success: false,
      message: "Selected schedule is no longer available.",
    });
  }

  if (!scheduleMatchesDate(schedule, next.date)) {
    return res.status(400).json({
      success: false,
      message: "Selected schedule is not available on this date.",
    });
  }

  const oldQty = Math.max(1, Number(previousBooking.qty) || 1);
  const newQty = Math.max(1, Math.floor(Number(next.qty) || 1));
  const oldActive = isBookingActive(previousBooking.status);
  const newActive = isBookingActive(next.status);
  const oldScheduleKey =
    previousBooking.scheduleKey || scheduleForBooking(config, previousBooking)?.key;
  const newScheduleKey = schedule.key;
  const sameSchedule = oldScheduleKey === newScheduleKey;
  const currentBooked = Number(schedule.booked || 0);

  if (newActive) {
    const seatsAlreadyHeld = sameSchedule && oldActive ? oldQty : 0;
    const seatsAvailableForEdit = Math.max(
      0,
      Number(schedule.capacity || 0) - currentBooked + seatsAlreadyHeld
    );

    if (newQty > seatsAvailableForEdit) {
      return res.status(409).json({
        success: false,
        message: `Only ${seatsAvailableForEdit} seat(s) are available for this schedule.`,
      });
    }
  }

  if (oldActive) changeScheduleBooked(config, oldScheduleKey, -oldQty);
  if (newActive) changeScheduleBooked(config, newScheduleKey, newQty);

  next.qty = newQty;
  next.fare = Number(schedule.fare ?? route.fare ?? 0);
  next.route = route.label || route.key;
  next.schedule = schedule.time;
  next.scheduleKey = schedule.key;
  next.vessel = schedule.vessel;

  const discountRates = {
    Regular: 0,
    PWD: 0.2,
    "Senior Citizen": 0.2,
    Child: 0.5,
  };

  const passengerList =
    Array.isArray(next.passengers) && next.passengers.length
      ? next.passengers
      : (Array.isArray(previousBooking.fareBreakdown)
          ? previousBooking.fareBreakdown
          : []
        ).map((item) => ({
          name: item.name,
          age: item.age,
          discountType: item.discountType || "Regular",
          pwdId: item.pwdId || item.discountIdReference || "",
          seniorId: item.seniorId || item.discountIdReference || "",
        }));

  next.fareBreakdown = Array.from({ length: newQty }, (_, passengerIndex) => {
    const passenger = passengerList[passengerIndex] || {};
    const type = Object.prototype.hasOwnProperty.call(
      discountRates,
      passenger.discountType
    )
      ? passenger.discountType
      : "Regular";

    const baseFare = next.fare;
    const discountAmount = Math.round(baseFare * discountRates[type] * 100) / 100;

    return {
      name: String(passenger.name || ""),
      age: Number(passenger.age || 0),
      discountType: type,
      discountPercent: Math.round(discountRates[type] * 100),
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
        passenger.discountIdReference ||
        passenger.pwdId ||
        passenger.seniorId ||
        "",
      baseFare,
      discountAmount,
      finalFare: Math.round((baseFare - discountAmount) * 100) / 100,
    };
  });

  next.amount =
    Math.round(
      next.fareBreakdown.reduce((sum, item) => sum + item.finalFare, 0) * 100
    ) / 100;
  next.updatedAt = new Date().toISOString();

  bookings[index] = next;
  writeJson(bookingsFile, bookings);
  writeJson(configFile, config);

  printSection("BOOKING UPDATED");
  console.log(`  Method     : PATCH /api/bookings/${req.params.id}`);
  console.log(`  Booking ID : ${next.id}`);
  printLine("-", 62);

  const fields = [
    ["Passenger", "name"],
    ["Contact", "contact"],
    ["Route", "route"],
    ["Date", "date"],
    ["Schedule", "schedule"],
    ["Passengers", "qty"],
    ["Amount", "amount"],
    ["Payment", "payment"],
    ["Status", "status"],
    ["Paid", "paid"],
    ["Vessel", "vessel"],
  ];

  let changed = false;

  for (const [label, key] of fields) {
    if (JSON.stringify(previousBooking[key]) !== JSON.stringify(next[key])) {
      changed = true;
      const before = previousBooking[key] ?? "-";
      const after = next[key] ?? "-";
      const beforeText =
        key === "amount" ? `₱${Number(before || 0).toLocaleString()}` : String(before);
      const afterText =
        key === "amount" ? `₱${Number(after || 0).toLocaleString()}` : String(after);

      console.log(`  ${label.padEnd(11)}: ${beforeText}  →  ${afterText}`);
    }
  }

  if (!changed) console.log("  No field values changed.");

  console.log();
  console.log("  UPDATED BOOKING");
  printLine("-", 62);
  printBookingSummary(next);

  const updatedSchedule = (config.schedules || []).find(
    (item) => item.key === newScheduleKey
  );

  if (updatedSchedule) {
    console.log(
      `  Seats Left : ${Math.max(0, Number(updatedSchedule.capacity) - Number(updatedSchedule.booked))}`
    );
  }

  printLine();

  res.json({ success: true, booking: next });
});

app.delete("/api/bookings/:id", (req, res) => {
  const bookings = readJson(bookingsFile, []);
  const index = bookings.findIndex((booking) => booking.id === req.params.id);

  if (index === -1) {
    return res.status(404).json({
      success: false,
      message: "Booking not found.",
    });
  }

  const booking = bookings[index];
  const config = readJson(configFile, { routes: [], schedules: [] });
  const schedule = scheduleForBooking(config, booking);

  if (schedule && isBookingActive(booking.status)) {
    changeScheduleBooked(
      config,
      schedule.key,
      -Math.max(1, Number(booking.qty) || 1)
    );
  }

  bookings.splice(index, 1);

  writeJson(bookingsFile, bookings);
  writeJson(configFile, config);

  printSection("BOOKING DELETED");
  printBookingSummary(booking);
  console.log("  Result     : Booking removed; seats released.");
  printLine();

  res.json({ success: true, id: booking.id });
});

app.get("/api/stats", (req, res) => {
  const bookings = readJson(bookingsFile, []);

  res.json({
    totalBookings: bookings.length,
    pendingBookings: bookings.filter(
      (booking) => booking.status === "Pending"
    ).length,
    confirmedBookings: bookings.filter(
      (booking) => booking.status === "Confirmed"
    ).length,
    cancelledBookings: bookings.filter(
      (booking) => booking.status === "Cancelled"
    ).length,
  });
});

if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));

  app.use((req, res, next) => {
    if (req.method === "GET" && !req.path.startsWith("/api/")) {
      return res.sendFile(path.join(distPath, "index.html"));
    }

    next();
  });
}


app.use((err, req, res, next) => {
  console.error("Express error:", err);

  if (res.headersSent) return next(err);

  res.status(500).json({
    success: false,
    message: "Internal server error.",
  });
});

app.listen(PORT, HOST, () => {
  printSection("MONTENEGRO LINES BACKEND");
  console.log(`  Port       : ${PORT}`);
  console.log(`  Host       : ${HOST}`);
  console.log("  Health     : /api/health");
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

# Montenegro Lines — Ferry & Passenger Management System

React + Vite frontend with an Express backend. Design and flow are unchanged.

## Project structure

```
Montenegro/
├── frontend/              ← FRONT END (React + Vite)
│   ├── index.html
│   ├── vite.config.js
│   ├── public/            icons, manifest.json, sw.js (PWA)
│   └── src/
│       ├── main.jsx / App.jsx / router.jsx
│       ├── config.js      backend address (API_BASE)
│       ├── pages/         Landing, Login, admin/, passenger/
│       ├── components/    Sidebar, TicketModal, RouteCards
│       ├── context/       DataContext, ToastContext
│       ├── data/          fleetData.js (routes, ships, schedules)
│       ├── services/      firebase.js, firestoreService.js (Google Sign-In + Firestore)
│       └── index.css
│
├── backend/               ← BACK END (Express)
│   ├── server.cjs         REST API: /api/bookings, /api/config, /api/stats, /api/health
│   ├── server-data/       bookings.json, users.json, system-config.json
│   └── .env.example
│
├── package.json           shared dependencies + scripts
└── README.md
```

## Run

```bash
npm install

npm run dev        # frontend only (Vite dev server, http://localhost:5173)
npm run server     # backend only  (http://localhost:8080)
npm run backend    # build frontend, then start backend (serves the site + API)
```

During development, run `npm run server` and `npm run dev` in two terminals.
The frontend talks to the backend at `API_BASE` in `frontend/src/config.js`
(default `http://localhost:8080`).

## Demo accounts

- Admin: `admin` / `admin123`
- Passenger: `passenger` / `1234`

You can also register a new passenger account from the login screen.

## Firebase (Google Sign-In + Firestore)

Config is in `frontend/src/services/firebase.js`; data access is in
`frontend/src/services/firestoreService.js`.

Collections:
- `USER/{Firebase Auth UID}` — `email`, `name`, `status`, `user` (`admin` | `passenger`)
- `BOOKINGS/{bookingId}` — passenger bookings

To enable Google Sign-In: Firebase Console → Authentication → Sign-in method →
enable **Google**, and add your domain under Authorized domains. New Google
accounts become `passenger` profiles. For a Google admin, create
`USER/{UID}` with `email`, `name`, `status: "active"`, `user: "admin"`.

Do not leave a temporary open Firestore rule in production. (`firestore.rules`
mentioned in older notes was not in the package — write and publish your own.)

## PWA

`frontend/public/manifest.json` and `frontend/public/sw.js` give install and
offline caching (network-first). The service worker registers only on production builds.

## Data storage

- Bookings, routes and schedules managed through the Express backend are saved in
  `backend/server-data/*.json`.
- Demo accounts and fallback data use the browser's `localStorage`.
- Google accounts use Firestore.

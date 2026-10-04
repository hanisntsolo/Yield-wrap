<div align="center">

# 🌱 YIELD WRAP

### *Surplus Today. Sustenance Tomorrow.*

**AI-powered, real-time food redistribution.** YIELD WRAP connects food **donors** (restaurants, caterers, stores, households) with **NGOs** that feed people, and dispatches **volunteers** to move the food before it expires. An **admin console** gives operators a live view of the whole network.

![Python](https://img.shields.io/badge/Python-3.12-3776AB?logo=python&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-0.115-009688?logo=fastapi&logoColor=white)
![MongoDB](https://img.shields.io/badge/MongoDB-7-47A248?logo=mongodb&logoColor=white)
![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=black)
![Vite](https://img.shields.io/badge/Vite-5-646CFF?logo=vite&logoColor=white)
![Tailwind](https://img.shields.io/badge/Tailwind_CSS-3-06B6D4?logo=tailwindcss&logoColor=white)
![scikit-learn](https://img.shields.io/badge/scikit--learn-1.6-F7931E?logo=scikitlearn&logoColor=white)
![Tests](https://img.shields.io/badge/tests-76_passing-brightgreen)

</div>

---

## 📑 Table of contents

1. [Features](#-features)
2. [How it works](#-how-it-works)
3. [Tech stack](#-tech-stack)
4. [Architecture](#-architecture)
5. [Project structure](#-project-structure)
6. [Getting started](#-getting-started)
7. [Configuration](#-configuration)
8. [User roles & dashboards](#-user-roles--dashboards)
9. [Donation lifecycle](#-donation-lifecycle)
10. [AI engine](#-ai-engine)
11. [Background dispatcher](#-background-dispatcher)
12. [API reference](#-api-reference)
13. [Real-time & notifications](#-real-time--notifications)
14. [Ad-Tech module](#-ad-tech-module)
15. [Security](#-security)
16. [Data model](#-data-model)
17. [Testing](#-testing)
18. [Deployment notes](#-deployment-notes)
19. [Troubleshooting](#-troubleshooting)

---

## ✨ Features

| Area | Highlights |
|---|---|
| 🤖 **AI matching** | Scores every verified NGO on distance, spare capacity, food-type fit, urgency and past acceptance rate, then offers the donation to the best one. If that NGO declines or doesn't answer in time, the offer passes to the next candidate. |
| 🚚 **Volunteer dispatch** | Once an NGO accepts, the nearest suitable volunteer is assigned automatically, taking vehicle capacity and rating into account. |
| ⏱️ **Priority queue** | Ranks open donations by time to expiry, urgency and quantity, so the most perishable food moves first. |
| 🗺️ **Routing** | Uses Google Directions when an API key is set; otherwise a Haversine estimate tuned per vehicle type, so it also works offline. Supports multi-stop ordering. |
| 📈 **Demand forecasting** | A Random Forest model predicts daily demand from day-of-week, season, holidays and temperature. With little data it falls back to a baseline average. |
| 📍 **Live tracking** | Volunteers stream GPS over a WebSocket; donors, NGOs and admins see the marker move in real time. |
| 🔔 **Notifications** | An in-app inbox that always works, plus optional Firebase Cloud Messaging push. |
| 📊 **Analytics** | KPIs, trends, food-type mix, NGO utilisation, volunteer performance and environmental impact (kg saved, meals, CO₂, water). |
| 💰 **Packaging Ad-Tech** | Donated food packets carry ads. Donors put their own sticker on 50 % of packets for free; the rest is sold to advertisers for **credits** (Razorpay). Credits also buy **NGO-premises posters** and **digital banners**. Volunteers apply stickers at pickup, NGOs earn a **30 % revenue share**, and QR scans measure reach. |
| 🧾 **Food-safety audit** | Every delivery records the receiver's name and the confirmed quantity. |
| 📱 **Responsive UI** | Mobile-first React dashboards, tested at 375 px, 768 px and 1440 px. |

---

## 🔄 How it works

```mermaid
flowchart LR
    A["🍱 Donor<br/>lists surplus food"] --> B["🤖 AI engine<br/>ranks compatible NGOs"]
    B --> C["🏠 NGO<br/>accepts the offer"]
    C --> D["🚴 Volunteer<br/>auto-assigned, picks up"]
    D --> E["🍽️ Meals served<br/>delivery audited"]
    B -. "declined / timed out" .-> B
```

1. **Donor lists surplus.** Food items (category, kg, expiry, allergens), a pickup address and an urgency level.
2. **AI matches an NGO.** The top-ranked NGO gets an *offer*; the donor sees the ranked candidates with score breakdowns.
3. **Volunteer picks up.** When the NGO accepts, a volunteer is allocated and follows a route through *Arrived at Pickup → Food Collected → Delivered*.
4. **Meals served.** The delivery is confirmed with the receiver's name and quantity, and impact metrics update everywhere.

---

## 🧰 Tech stack

| Layer | Technology |
|---|---|
| **Backend** | Python 3.12, FastAPI, Uvicorn, Pydantic v2 / pydantic-settings |
| **Database** | MongoDB 7 via async **Motor** |
| **Auth** | JWT (PyJWT) in **httpOnly cookies**, bcrypt password hashing |
| **AI / ML** | scikit-learn (RandomForestRegressor), NumPy, pandas, joblib |
| **Integrations** | Google Maps Directions (optional), Firebase Admin / FCM (optional) |
| **Frontend** | React 18, React Router 6, Vite 5, Tailwind CSS 3 |
| **UI libraries** | Recharts (charts), Leaflet + react-leaflet / `@react-google-maps/api` (maps), react-hot-toast, axios |
| **Testing** | pytest, pytest-asyncio, mongomock-motor (in-memory MongoDB) |
| **Ops** | Docker, Docker Compose |

---

## 🏗️ Architecture

```mermaid
flowchart TB
    subgraph Browser["🌐 Browser — React SPA (Vite)"]
        UI["Pages & dashboards"]
        CTX["AuthContext · NotificationContext"]
        API["axios client<br/>(cookies, auto-refresh)"]
        WSC["WebSocket hook"]
        MAP["MapView<br/>Google Maps ⟷ Leaflet/OSM"]
    end

    subgraph Backend["⚙️ FastAPI backend"]
        R["Routers<br/>auth · donor · ngo · volunteer · admin<br/>ai · analytics · notifications · ads · ws"]
        S["Services<br/>auth · donations · maps · fcm · ads · realtime · rate-limit"]
        AI["AI engine<br/>matching · allocator · priority · routing · forecasting"]
        SCH["Background dispatcher<br/>(every 5 min)"]
    end

    DB[("🍃 MongoDB")]
    GM["Google Maps API"]
    FCM["Firebase Cloud Messaging"]

    UI --> CTX --> API -->|"REST /api/*"| R
    WSC <-->|"/ws/volunteer/{id}/location"| R
    R --> S --> DB
    R --> AI --> DB
    SCH --> AI
    S -. optional .-> GM
    S -. optional .-> FCM
```

**Design principles**

- **Graceful degradation.** Every external integration is optional. Without a Google key, routing uses Haversine estimates and maps use OpenStreetMap. Without Firebase, notifications use the in-app inbox only. With too little history, forecasting uses a baseline.
- **Async end to end.** Motor for MongoDB. CPU-bound work (bcrypt, model training) runs in threads.
- **Single source of truth for the API.** [`docs/API_CONTRACT.md`](docs/API_CONTRACT.md).
- **Uniform errors.** Every error is `{"error": "...", "code": "...", "details"?: [...]}`.

---

## 📁 Project structure

```text
YieldWrap/
├── docker-compose.yml          # backend + frontend + MongoDB
├── .env.example                # copy to .env
├── docs/
│   └── API_CONTRACT.md         # endpoint/payload contract shared by both halves
│
├── backend/
│   ├── main.py                 # app factory, CORS, security headers, lifespan, /api/health
│   ├── config.py               # all settings (env / .env)
│   ├── errors.py               # APIError + uniform JSON error handlers
│   ├── requirements.txt
│   ├── models/                 # Pydantic request/response models
│   │   ├── common.py           #   shared types: Text, Phone, Location, datetimes
│   │   ├── user.py  donation.py  matching.py  analytics.py
│   ├── routers/                # HTTP + WebSocket endpoints, one file per area
│   │   ├── auth.py  donor.py  ngo.py  volunteer.py  admin.py
│   │   ├── matching.py  forecast.py  routing.py      # /api/ai/*
│   │   ├── analytics.py  notifications.py  ads.py  ws.py
│   ├── services/               # business logic & integrations
│   │   ├── db_service.py       #   Motor client + indexes
│   │   ├── auth_service.py     #   bcrypt, JWT, cookies, role guards
│   │   ├── donation_service.py #   lifecycle transitions
│   │   ├── maps_service.py     #   Google Directions client
│   │   ├── fcm_service.py      #   push + in-app inbox
│   │   ├── realtime.py         #   WebSocket location hub
│   │   ├── scheduler.py        #   background dispatch loop
│   │   ├── analytics_service.py  ads_service.py  rate_limit.py
│   ├── ai_engine/
│   │   ├── matching.py         #   donor → NGO scoring
│   │   ├── volunteer_allocator.py
│   │   ├── priority_engine.py
│   │   ├── route_optimizer.py
│   │   ├── forecasting.py      #   RandomForest demand model
│   │   └── geo.py              #   Haversine helpers
│   ├── uploads/                # NGO verification documents (gitignored)
│   └── tests/                  # pytest suite (in-memory MongoDB)
│
└── frontend/
    ├── index.html  vite.config.js  tailwind.config.js
    ├── public/
    │   └── firebase-messaging-sw.js
    └── src/
        ├── index.jsx  App.jsx  index.css
        ├── pages/              # Landing, Login, Register, Donor/NGO/Volunteer/Admin dashboards,
        │                       # Notifications, Profile, NotFound
        ├── components/
        │   ├── Navbar, MapView, DonationForm, MatchCard, AnalyticsChart, NotificationBell, AdBanner
        │   ├── common/  auth/  landing/  donor/  ngo/  volunteer/  admin/  map/
        ├── context/            # AuthContext, NotificationContext
        ├── hooks/              # usePolling, useVolunteerSocket, useLocationSharing, useGeolocation, …
        ├── services/           # api (axios), firebase, geocoding, googleMaps
        └── utils/              # constants, formatters, geo (polyline decoder)
```

---

## 🚀 Getting started

### Prerequisites

- **Docker** + **Docker Compose**, *or*
- **Python 3.12+**, **Node.js 18+** (22 recommended) and **MongoDB 7**

### Option A: Docker Compose (recommended)

```bash
cp .env.example .env          # then set a long random JWT_SECRET
docker compose up --build
```

| Service | URL |
|---|---|
| Web app | http://localhost:3005 |
| API | http://localhost:8080 |
| Interactive API docs (Swagger) | http://localhost:8080/docs |
| Health check | http://localhost:8080/api/health |
| MongoDB | `mongodb://user:pass@localhost:27017` |

> Host ports are defined in `docker-compose.yml`. If you change the API port, also change the frontend's `VITE_API_URL` build arg and the backend's `FRONTEND_URL` (used for CORS).

### Option B: Local development

**1. MongoDB.** Use any MongoDB 7 instance, for example:

```bash
docker run -d --name yw-mongo -p 27017:27017 mongo:7.0
```

**2. Backend**

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
export MONGODB_URL="mongodb://localhost:27017"
export ADMIN_SIGNUP_CODE="choose-a-code"      # needed to register admins
uvicorn main:app --reload --port 8000
```

**3. Frontend**

```bash
cd frontend
cp .env.example .env          # VITE_API_URL=http://localhost:8000
npm install
npm run dev                   # http://localhost:3000
```

**4. First steps in the app**

1. Open the web app and choose **Register**, then pick a role.
2. Register an **Admin** using `ADMIN_SIGNUP_CODE`, then **verify** NGOs under *Admin → Users*. Only verified NGOs receive AI offers.
3. Register a **Volunteer** and switch **Available for pickups** on.
4. As a **Donor**, list food and click **Find Match**.

### npm scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Vite dev server with HMR on port 3000 |
| `npm run build` | Production bundle in `frontend/dist/` |
| `npm run preview` | Serve the production build on port 3000 |

---

## ⚙️ Configuration

### Backend (`.env` in the project root or `backend/`)

| Variable | Default | Description |
|---|---|---|
| `ENVIRONMENT` | `development` | `production` enforces a real `JWT_SECRET` and disables dev CORS origins |
| `MONGODB_URL` | `mongodb://localhost:27017` | Mongo connection string |
| `MONGODB_DB` | `yieldwrap` | Database name |
| `JWT_SECRET` | dev placeholder | **Required in production.** Signs access and refresh tokens |
| `ACCESS_TOKEN_MINUTES` | `30` | Access-token lifetime |
| `REFRESH_TOKEN_DAYS` | `7` | Refresh-token lifetime |
| `COOKIE_SECURE` | `false` | Set `true` behind HTTPS |
| `COOKIE_SAMESITE` | `lax` | Cookie SameSite policy |
| `ADMIN_SIGNUP_CODE` | *(empty)* | Code required to register an admin; empty disables admin signup |
| `FRONTEND_URL` | `http://localhost:3000` | Allowed CORS origin |
| `EXTRA_CORS_ORIGINS` | *(empty)* | Comma-separated extra origins |
| `GOOGLE_MAPS_API_KEY` | *(empty)* | Enables Google Directions routing |
| `FIREBASE_CREDENTIALS_PATH` | *(empty)* | Service-account JSON; enables FCM push |
| `APP_TIMEZONE` | `Asia/Kolkata` | Used for operating hours, holidays, ad dayparts |
| `MAX_MATCH_DISTANCE_KM` | `50` | NGO search radius |
| `MAX_VOLUNTEER_DISTANCE_KM` | `25` | Volunteer search radius |
| `OFFER_TIMEOUT_MINUTES` | `30` | Unanswered NGO offers pass to the next candidate |
| `REMATCH_INTERVAL_MINUTES` | `10` | Retry interval for unmatched donations |
| `EXPIRING_SOON_HOURS` | `2` | Threshold for "expiring soon" warnings |
| `ENABLE_SCHEDULER` | `true` | Run the background dispatcher |
| `SCHEDULER_INTERVAL_SECONDS` | `300` | Dispatcher cycle length |
| `MAX_UPLOAD_MB` | `5` | NGO document size limit |
| `KG_PER_MEAL` / `CO2_KG_PER_FOOD_KG` / `WATER_LITERS_PER_FOOD_KG` | `0.4` / `2.5` / `1000` | Impact conversion factors |

### Frontend (`frontend/.env`, read at **build time**)

| Variable | Description |
|---|---|
| `VITE_API_URL` | Backend base URL, no trailing slash. Default `http://localhost:8000` |
| `VITE_GOOGLE_MAPS_API_KEY` | Google Maps + Places. Without it the app uses Leaflet/OpenStreetMap and Nominatim search |
| `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_MESSAGING_SENDER_ID`, `VITE_FIREBASE_APP_ID`, `VITE_FIREBASE_VAPID_KEY` | Browser push notifications. All must be set, otherwise push stays off |
| `VITE_ADSENSE_CLIENT` | `ca-pub-…` to serve Google AdSense instead of the built-in ad server |

---

## 👥 User roles & dashboards

| Role | Route | What they can do |
|---|---|---|
| **Donor** | `/donor` | **Quick Donate** form (multiple items, allergens, address autocomplete, urgency) → **Find Match** with ranked NGO cards · *My donations* (view, edit while pending, cancel until pickup) · **live tracking** map with ETA · impact stats |
| **NGO** | `/ngo` | **Incoming matches** (AI offers + compatible open donations, live expiry countdown, Accept/Decline) · **capacity manager** · active deliveries map · **7-day demand forecast** · history + CSV export · verification banner |
| **Volunteer** | `/volunteer` | **Availability** toggle · prioritised **task queue** · **active task** with route map, turn-by-turn steps, *Open in Google Maps*, stage buttons and the delivery-audit modal · automatic GPS sharing · leaderboard · stats & history |
| **Business** | `/business` | **Advertising hub**: wallet and credit packs (Razorpay), creative uploads, packet-sticker / NGO-poster / digital campaigns with live cost, progress and QR scans. See [Ad-Tech](#-ad-tech-module) |
| **Admin** | `/admin` | **Overview**: KPIs (refreshed every 15 s), live network map, priority queue, impact · **Analytics**: trend, food types, NGO utilisation, volunteer performance · **Users**: search, verify, suspend, delete · **Donations**: all, filterable · **Broadcast** notifications by role |

Public pages: **Landing** (`/`), **Login**, **Register** (`/register?role=donor|ngo|volunteer` preselects the role). Signed-in pages: **Notifications** and **Profile**, where NGOs can upload or replace their verification document.

**Registration fields by role**

| Role | Extra fields |
|---|---|
| Donor | — (name, email, password, phone, address) |
| NGO | organisation name, registration number, accepted food types, storage capacity (kg), beneficiaries, verification document (PDF/PNG/JPG ≤ 5 MB) |
| Volunteer | vehicle type: `bike`, `car`, `van`, `on_foot` |
| Business | business name, business type (restaurant, hotel, cafe, caterer, retail, other), website |
| Admin | `admin_code` matching `ADMIN_SIGNUP_CODE` |

Passwords need **8 or more characters, with at least one letter and one number**.

---

## 🔁 Donation lifecycle

```mermaid
stateDiagram-v2
    [*] --> pending: Donor creates donation
    pending --> matched: AI offers to best NGO
    matched --> matched: NGO declines / offer times out → next NGO
    matched --> matched: NGO accepts → volunteer assigned<br/>(task_stage = assigned → accepted → at_pickup)
    matched --> in_transit: Volunteer "Food Collected"<br/>(task_stage = picked_up)
    in_transit --> delivered: Volunteer "Delivered"<br/>+ receiver name & confirmed kg
    pending --> cancelled: Donor cancels
    matched --> cancelled: Donor cancels (before pickup)
    pending --> expired: Food expires before pickup
    matched --> expired: Food expires before pickup
    delivered --> [*]
    cancelled --> [*]
    expired --> [*]
```

| `status` | `task_stage` | Meaning |
|---|---|---|
| `pending` | `null` | Waiting for an NGO match |
| `matched` | `null` | Offered to an NGO (`ngo_accepted = false`) |
| `matched` | `assigned` | NGO accepted; a volunteer has been offered the task |
| `matched` | `accepted` → `at_pickup` | Volunteer is on the way / at the pickup point |
| `in_transit` | `picked_up` | Food collected, heading to the NGO |
| `delivered` | `delivered` | Delivered and audited (`delivery_record`) |
| `cancelled` / `expired` | — | Terminal states |

---

## 🤖 AI engine

All scores are normalised to **0 – 1**.

### 1. NGO matching (`ai_engine/matching.py`)

NGOs are skipped as **ineligible** if they are unverified, inactive, farther than `MAX_MATCH_DISTANCE_KM`, accept none of the donated food categories, or have no spare capacity.

| Factor | Weight | How it is scored |
|---|---:|---|
| Distance | **0.30** | `1 − distance / max_distance` |
| Capacity | **0.25** | 0.5–1.0 if the donation fits (more headroom scores higher), below 0.5 if it only partly fits |
| Food-type fit | **0.20** | Share of donated kg in categories the NGO accepts |
| Urgency | **0.15** | Critical/high donations favour high-capacity NGOs that are **open now** |
| History | **0.10** | The NGO's acceptance rate (0.5 for new NGOs) |

The best match receives the offer, and the top 3 are returned to the donor with a per-factor `breakdown`.

### 2. Volunteer allocation (`ai_engine/volunteer_allocator.py`)

| Factor | Weight | Notes |
|---|---:|---|
| Proximity | **0.50** | Within `MAX_VOLUNTEER_DISTANCE_KM` of the pickup |
| Vehicle suitability | **0.30** | Heavy (≥ 40 kg) or critical loads prefer van > car > bike; light loads prefer nimble vehicles. Penalised if the load exceeds vehicle capacity (on foot 5, bike 15, car 80, van 400 kg) |
| Rating | **0.20** | Volunteer rating out of 5 |

Only available volunteers without an active task are considered. If the assigned volunteer declines, the task goes to the next one.

### 3. Priority queue (`ai_engine/priority_engine.py`)

```text
priority = 0.45 × expiry  +  0.35 × urgency  +  0.20 × quantity
expiry   = 1 − min(hours_to_expiry, 48) / 48
```

The queue is used by the dispatcher, the volunteer task list and the admin console.

### 4. Route optimisation (`ai_engine/route_optimizer.py`)

- **Google provider.** Directions API with an encoded polyline and turn-by-turn steps.
- **Fallback provider.** Haversine distance × 1.4 road factor, speed by vehicle (bike 15, car 35, van 30, on foot 5 km/h).
- **Multi-stop** (`/api/ai/route/multi`, ≤ 5 stops). Nearest-neighbour ordering with cumulative ETA and distance.

### 5. Demand forecasting (`ai_engine/forecasting.py`)

- **Model:** `RandomForestRegressor`, trained on daily `analytics_logs`.
- **Features:** cyclic day-of-week and month, holiday flag, season, average temperature, previous 7-day average.
- Needs **≥ 30 days** of history. It retrains when the model is older than 7 days and saves it with joblib in `ai_engine/models/`.
- With less data, a **baseline** (day-of-week average of the last 4 weeks) is returned. The response says which model was used: `model.source = "random_forest" | "baseline"`.

---

## ⏲️ Background dispatcher

`services/scheduler.py` runs every `SCHEDULER_INTERVAL_SECONDS` (default 5 min) inside the API process:

| Step | Action |
|---|---|
| **Expire** | Marks donations whose food expired before pickup as `expired`; their kg counts as wasted |
| **Warn** | Notifies the donor and admins about open donations expiring within `EXPIRING_SOON_HOURS` |
| **Auto-match** | Matches new or stale pending donations, in priority order, and passes offers that weren't answered within `OFFER_TIMEOUT_MINUTES` to the next NGO |
| **Allocate** | Assigns volunteers to accepted donations that are still waiting for one |
| **Roll-up** | Writes daily `analytics_logs`, which feed the forecasting model |

Disable it with `ENABLE_SCHEDULER=false`, for example when running several API replicas; then run one dedicated worker.

---

## 📡 API reference

Base URL: `http://<host>:<port>`. Interactive docs are at **`/docs`** (Swagger) and **`/redoc`**. The full payload contract is in **[`docs/API_CONTRACT.md`](docs/API_CONTRACT.md)**.

<details>
<summary><b>🔐 Auth — <code>/api/auth</code></b></summary>

| Method | Path | Description |
|---|---|---|
| POST | `/register` | Create an account (role-specific fields) and sign in |
| POST | `/login` | Sign in (rate-limited) |
| POST | `/refresh` | Rotate tokens using the refresh cookie |
| POST | `/logout` | Clear cookies |
| GET / PUT | `/me` | Current user + NGO/volunteer profile / update name, phone, location |
| POST | `/ngo-document` | Upload NGO verification document (multipart `file`) |
| POST | `/fcm-token` | Register a browser push token |
</details>

<details>
<summary><b>🍱 Donor — <code>/api/donor</code></b></summary>

| Method | Path | Description |
|---|---|---|
| POST / GET | `/donations` | Create / list own donations |
| GET / PUT / DELETE | `/donations/{id}` | View / edit (pending only) / cancel (until pickup) |
| GET | `/donations/{id}/track` | Status, volunteer location, ETA |
| GET | `/stats` | Totals, meals, CO₂ saved |
</details>

<details>
<summary><b>🏠 NGO — <code>/api/ngo</code></b></summary>

| Method | Path | Description |
|---|---|---|
| GET / PUT | `/profile` | NGO profile |
| GET | `/available-donations` | AI offers, then compatible open donations |
| POST | `/accept/{id}` · `/decline/{id}` | Respond to an offer |
| GET | `/incoming` | Accepted donations en route |
| PUT | `/capacity` | Update current load / storage capacity |
| GET | `/history` · `/history.csv` | Delivered donations (JSON / CSV) |
</details>

<details>
<summary><b>🚴 Volunteer — <code>/api/volunteer</code></b></summary>

| Method | Path | Description |
|---|---|---|
| GET | `/profile` | Volunteer profile |
| PUT | `/availability` | Toggle availability |
| GET | `/tasks` | Assigned tasks with priority |
| POST | `/tasks/{id}/accept` · `/tasks/{id}/decline` | Respond to a task |
| PUT | `/tasks/{id}/status` | `at_pickup` → `picked_up` → `delivered` (+ `receiver_name`, `quantity_confirmed_kg`) |
| PUT | `/location` | Publish GPS position |
| GET | `/history` · `/leaderboard` | Past deliveries / monthly ranking |
</details>

<details>
<summary><b>🛡️ Admin — <code>/api/admin</code></b></summary>

| Method | Path | Description |
|---|---|---|
| GET | `/users?role=&q=` | Search users |
| PUT | `/users/{id}/verify` · `/users/{id}/suspend` | Verify / suspend |
| DELETE | `/users/{id}` | Delete user |
| GET | `/donations?status=` | All donations |
| GET | `/system-stats` · `/map` | Network statistics / live map data |
| POST | `/broadcast` | Notify all users or one role |
</details>

<details>
<summary><b>🤖 AI — <code>/api/ai</code></b></summary>

| Method | Path | Description |
|---|---|---|
| POST | `/match/{donation_id}` | Rank NGOs and send the offer |
| GET | `/forecast?days=7` | Demand forecast |
| POST | `/route` · `/route/multi` | Route + ETA / multi-stop ordering |
| POST | `/allocate-volunteer` | Force volunteer allocation |
| GET | `/priority-queue` | Ranked open donations |
</details>

<details>
<summary><b>📊 Analytics, 🔔 Notifications, 💰 Ads, ❤️ Meta</b></summary>

| Method | Path | Description |
|---|---|---|
| GET | `/api/analytics/public-impact` | **Public** impact counters (landing page) |
| GET | `/api/analytics/dashboard` | Admin KPIs |
| GET | `/api/analytics/donations/trend?period=daily\|weekly&days=30` | Trend series |
| GET | `/api/analytics/food-types` · `/ngo-utilization` · `/volunteer-performance` · `/waste-saved` | Chart data |
| GET | `/api/notifications/` · `/unread-count` | Inbox |
| POST | `/api/notifications/{id}/read` · `/read-all` | Mark read |
| GET | `/api/ads/?slot=&page=` | Pick an ad for a slot |
| POST | `/api/ads/impression` · `/api/ads/click` | Ad event logging |
| GET | `/api/ads/partners` | Verified premium partners |
| GET | `/api/health` | DB status, maps provider, push status |
</details>

### Error format

```json
{
  "error": "name: String should have at least 2 characters",
  "code": "VALIDATION_ERROR",
  "details": [{ "field": "name", "message": "String should have at least 2 characters" }]
}
```

Common codes: `VALIDATION_ERROR` (422), `UNAUTHORIZED` / `TOKEN_EXPIRED` / `INVALID_CREDENTIALS` (401), `FORBIDDEN` / `ACCOUNT_SUSPENDED` (403), `NOT_FOUND` (404), `CONFLICT` (409), `FILE_TOO_LARGE` (413), `RATE_LIMITED` (429).

### Quick `curl` example

```bash
API=http://localhost:8000
# Register a donor (cookies saved to jar.txt)
curl -c jar.txt -H 'Content-Type: application/json' -X POST $API/api/auth/register -d '{
  "name":"Green Bistro","email":"bistro@example.com","password":"Passw0rd1","role":"donor",
  "phone":"+919800000000","location":{"address":"Bandra, Mumbai","lat":19.06,"lng":72.83}}'

# List surplus food
curl -b jar.txt -H 'Content-Type: application/json' -X POST $API/api/donor/donations -d '{
  "food_items":[{"name":"Veg biryani","category":"cooked","quantity_kg":20,
                 "expiry_time":"2030-01-01T20:00:00+05:30","allergens":[]}],
  "pickup_location":{"address":"Bandra, Mumbai","lat":19.06,"lng":72.83},
  "urgency_level":"high"}'

# Ask the AI for matches
curl -b jar.txt -X POST $API/api/ai/match/<donation_id>
```

---

## 📍 Real-time & notifications

**Live location (WebSocket)**

```text
ws://<host>/ws/volunteer/{volunteer_id}/location      (authenticated by the access_token cookie)
```

- **Subscribers** are the donor and NGO of the volunteer's active task, and admins. They receive `{volunteer_id, lat, lng, timestamp}` and get the last known position as soon as they connect.
- **The volunteer** publishes `{lat, lng}` frames. The frontend sends GPS about every 10 s while a task is active, and falls back to `PUT /api/volunteer/location` if the socket is down.
- Connections without a valid cookie are rejected with **403**. The client reconnects automatically with backoff.

**Notifications**

- Every event (new offer, task assigned, picked up, delivered, expiring soon, broadcast) is stored in the **in-app inbox**. The bell checks the unread count about every 20 s.
- If `FIREBASE_CREDENTIALS_PATH` (backend) and all `VITE_FIREBASE_*` variables (frontend) are set, the same events are also sent as **FCM push** messages. Dead tokens are pruned automatically.

---

## 💰 Ad-Tech module

YIELD WRAP turns **donated food packaging into ad space**. Every sponsored sticker helps pay for food rescue.

```mermaid
flowchart LR
    D["🍱 Donor donates<br/>100 packets"] --> S{"Split<br/>(AD_OWN_SHARE)"}
    S -->|50 packets, free| O["Donor's own sticker"]
    S -->|50 packets| P["Sponsored pool"]
    B["🏪 Businesses & donors<br/>buy credits (Razorpay)"] --> C["Packet campaigns"]
    C -->|"filled when NGO accepts"| P
    P --> V["🚴 Volunteer applies<br/>stickers at pickup"]
    O --> V
    V --> N["🏠 NGO receives food<br/>earns 30 % of sticker credits"]
    V -. QR scans .-> A["📈 Advertiser analytics"]
```

### Three ways to advertise

| Placement | How it works | Price (default) |
|---|---|---|
| 📦 **Packet stickers** | Your sticker goes on donated food packets. You can limit it to pickups within a radius of a location | **2 credits / packet** |
| 🪧 **NGO posters** | Book a wall or notice board listed by an NGO (kitchen, shelter), by the week. The NGO confirms once it's displayed | Set by the NGO (default **50 credits / week**) |
| 💻 **Digital banners** | Paid banners across the platform's dashboard ad slots | **10 credits / 1,000 impressions** |

1 credit = **₹5**. Packs: **Starter** 100 cr ₹499 · **Growth** 500 cr ₹1,999 · **Pro** 2,000 cr ₹6,999.

### Who does what

| Role | In the ad flow |
|---|---|
| **Donor** (restaurant / hotel) | Sets a **packet count** on each donation and can put their own sticker on 50 % of the packets **for free**. Can also buy credits and run campaigns under **Advertising** |
| **Business** (new role) | Companies that advertise **without donating**. Their dashboard (`/business`) is the advertising hub: wallet, creatives, campaigns |
| **Admin** | **Approves every creative** before it is printed or shown. Sees revenue and credit flows; can grant or deduct credits |
| **Volunteer** | Prints the **sticker sheet** for the task, applies the stickers at pickup, and **confirms how many** were applied before marking the food collected |
| **NGO** | Lists **ad spaces** and confirms posters are displayed. Earns a **30 % revenue share** on sponsored stickers delivered to it and on poster bookings |

### Lifecycle of a sponsored sticker

1. **Creative.** An advertiser uploads a design (title, tagline, QR link, PNG/JPG) and an admin approves it.
2. **Credits.** The advertiser buys a pack with Razorpay Checkout. The server verifies the HMAC signature, and the webhook is accepted as a backup. Credits are added exactly once.
3. **Campaign.** Credits are **debited at launch**. Anything unused is refunded on cancel.
4. **Allocation.** When an NGO **accepts** a donation, its sponsored pool is filled from active packet campaigns, oldest first, respecting location targets. The dispatcher retries every cycle.
5. **Pickup.** The volunteer opens the printable sheet (A4, 4 × 6 round labels, one QR code each) and confirms the count. **Sponsored stickers are counted first**, then the donor's own. Any shortfall goes back to the advertisers.
6. **Delivery.** The NGO is credited its share. A campaign is **completed** when all its packets have been applied.
7. **Reach.** Each QR code points to `/api/ads/s/{creative}?d={donation}`, which logs the scan and redirects to the advertiser's link.

If a donation is cancelled or expires before pickup, its allocated packets go **back to the campaigns**, or are refunded if the campaign was cancelled meanwhile.

### Payments setup

| Variable | Purpose |
|---|---|
| `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` | Razorpay **test** (or live) keys. Enable real checkout |
| `RAZORPAY_WEBHOOK_SECRET` | Verifies `POST /api/ads/webhooks/razorpay` (`payment.captured`, `order.paid`) |
| `AD_OWN_SHARE` | Donor's free share of packets (default `0.5`) |
| `NGO_REVENUE_SHARE` | NGO share of sticker and poster credits (default `0.3`) |
| `CREDIT_VALUE_INR`, `PACKET_STICKER_CREDITS`, `DIGITAL_CREDITS_PER_1000`, `NGO_POSTER_WEEK_DEFAULT` | Pricing |

> Without Razorpay keys, and only when `ENVIRONMENT` is not `production`, the app uses a clearly labelled **test checkout** so the whole flow can be demoed. In production without keys, credit purchase returns `503 PAYMENTS_UNAVAILABLE`.

### Banner slots (digital ads)

| Slot | Size | Placement |
|---|---|---|
| `leaderboard` | 728 × 90 | Top of dashboards (desktop) |
| `rectangle` | 300 × 250 | Right sidebar (desktop) |
| `mobile` | 320 × 50 | Small screens |

- **Paid campaigns** (`cmp_…` ids) are preferred over house ads and labelled *Sponsored · {advertiser}*. Impressions count against the purchased amount.
- **Targeting:** role (×2), daypart (breakfast 6–11, lunch 11–16, dinner 18–23) and geo-radius.
- **Tracking:** one impression per ad per page view (IntersectionObserver); clicks are logged before the link opens.
- House ads are seeded on first start. Set `VITE_ADSENSE_CLIENT` to use Google AdSense instead.
- **Verified Partner** badges are shown for users with `is_premium_partner`.

Endpoints: see **Packaging Ad-Tech (v2)** in [`docs/API_CONTRACT.md`](docs/API_CONTRACT.md#packaging-ad-tech-v2).

---

## 🔒 Security

- **Tokens never touch JavaScript.** The access token (30 min) and refresh token (7 days, path `/api/auth`) are **httpOnly** cookies. The client refreshes once on a 401 and retries the request, with concurrent refreshes deduplicated.
- **bcrypt** password hashing (12 rounds). Login failures take the same time whether or not the email exists, so accounts can't be discovered by timing.
- **Login rate limiting:** 10 attempts per 15 min per IP + email.
- **Role-based access:** `require_roles(...)` on every protected route; suspended users are rejected.
- **Input hygiene:** strict Pydantic models, control-character stripping, length limits, upload type and size checks.
- **Security headers:** `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`, and `Cache-Control: no-store` on API GETs.
- **CORS** is limited to `FRONTEND_URL` + `EXTRA_CORS_ORIGINS`, with credentials.
- **Production checklist:** set `ENVIRONMENT=production`, a long random `JWT_SECRET`, `COOKIE_SECURE=true`, serve over HTTPS, and keep `ADMIN_SIGNUP_CODE` secret (or leave it empty after creating admins).

---

## 🗄️ Data model

| Collection | Purpose | Key indexes |
|---|---|---|
| `users` | Accounts for every role | `email` (unique), `role` |
| `ngos` | NGO profiles: capacity, food types, hours, acceptance rate | `user_id` (unique) |
| `volunteers` | Volunteer profiles: vehicle, availability, location, stats | `user_id` (unique) |
| `donations` | Donations, matching state, task stage, delivery record | `(status, created_at)`, `donor_id`, `matched_ngo_id`, `assigned_volunteer_id` |
| `analytics_logs` | Daily roll-ups (forecasting training data) | `date` (unique) |
| `notifications` | In-app inbox | `(user_id, created_at)` |
| `ads` / `ad_impressions` | Ad inventory and event log | `(ad_id, timestamp)` |

Object shapes are documented in [`docs/API_CONTRACT.md`](docs/API_CONTRACT.md#core-objects).

---

## 🧪 Testing

The backend suite runs against an **in-memory MongoDB** (mongomock-motor), so no database is needed.

```bash
cd backend
source .venv/bin/activate
python -m pytest -q
```

| File | Covers |
|---|---|
| `test_matching.py` | NGO eligibility and scoring factors, ranking |
| `test_priority.py` | Priority score, expiry/urgency ordering |
| `test_forecasting.py` | Feature engineering, baseline vs. Random Forest, persistence |
| `test_routes.py` | Auth, role guards, validation errors, endpoint contracts |
| `test_workflow.py` | Full lifecycle: donate → match → accept → allocate → pick up → deliver, cancellation, expiry |
| `test_ad_market.py` | Business role, creatives + review, Razorpay signatures and idempotent crediting, campaigns and refunds, packet split/allocation/sticker confirmation, NGO earnings, posters, digital ads, sticker sheet access, QR scans, admin revenue |

Current result: **76 passed**.

Frontend check:

```bash
cd frontend && npm run build
```

---

## 🚢 Deployment notes

- **The frontend is a static build.** `VITE_*` values are baked in at build time, so rebuild when they change. Serve `frontend/dist/` from any static host or CDN, with SPA fallback to `index.html`.
- **Backend:** `uvicorn main:app --host 0.0.0.0 --port 8000` (add `--workers N` with `ENABLE_SCHEDULER=false` on all but one instance).
- **Reverse proxy:** forward `/api` and `/ws` to the backend, and enable WebSocket upgrade for `/ws/*`. Serving the frontend and API from the same domain keeps cookies first-party.
- **Persistence:** keep the MongoDB volume, `backend/uploads/` (NGO documents) and `backend/ai_engine/models/` (trained model; it is rebuilt if missing).

---

## 🛠️ Troubleshooting

| Symptom | Fix |
|---|---|
| Browser calls fail with CORS errors | Set `FRONTEND_URL` (or `EXTRA_CORS_ORIGINS`) to the exact origin of the web app |
| Logged in, but every request returns 401 | Frontend and API must be on the same site for `SameSite=Lax` cookies, and `COOKIE_SECURE=true` requires HTTPS |
| Donor gets no matches | NGOs must be **verified** by an admin, accept the food category, have spare capacity and be within `MAX_MATCH_DISTANCE_KM` |
| No volunteer assigned after NGO accepts | A volunteer must be **available**, have no active task, and be within `MAX_VOLUNTEER_DISTANCE_KM`. The dispatcher retries every cycle |
| Forecast says *Baseline average* | Fewer than 30 days of history; the Random Forest takes over automatically once there is enough |
| Cannot register an admin | Set `ADMIN_SIGNUP_CODE` on the backend and enter it in the form |
| `MongoDB not ready … retrying` at startup | Normal while Mongo boots under Compose; the API retries 15 times |
| Port already in use | Change the host ports in `docker-compose.yml` (and `VITE_API_URL` / `FRONTEND_URL` to match) |

---

<div align="center">

**YIELD WRAP** · *Surplus Today. Sustenance Tomorrow.* 🌱

</div>

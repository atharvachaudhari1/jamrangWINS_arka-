# Doorway — One small step at a time.

Doorway is an energy-aware academic planner for flexible, guilt-free learning. It is a personalized version of the open-source [JumpyBrain](https://github.com/tanay9098/JumpyBrain) project. The original task manager, focus tools, Gmail, Slack, and Google Calendar integrations are still here. Academic planning is added beside them.

OpenAI, when configured, can draft tasks or break an assignment into steps. It does not choose what you do next. The basic planner works with no AI key.

This copy does not claim authorship of the original JumpyBrain code. The [GNU AGPL v3](./LICENSE) and its notices stay in place.

---

## Table of Contents

- [What Is Doorway?](#what-is-doorway)
- [Features](#features)
- [How to Use (No-Code Guide)](#how-to-use-no-code-guide)
- [Project Structure](#project-structure)
- [Tech Stack](#tech-stack)
- [Getting Started (Developer Guide)](#getting-started-developer-guide)
  - [Prerequisites](#prerequisites)
  - [Environment Variables](#environment-variables)
  - [Running the Backend](#running-the-backend)
  - [Running the Frontend](#running-the-frontend)
  - [Loading the Chrome Extension](#loading-the-chrome-extension)
  - [Syncing auth with the Chrome extension](#syncing-auth-with-the-chrome-extension)
  - [Building the Mobile App](#building-the-mobile-app)
- [API Overview](#api-overview)
- [Deployment](#deployment)
- [Contributing](#contributing)
- [License](#license)

---

## What Is Doorway?

Doorway is a web app, plus the original Chrome extension, that helps a student pick one manageable next step from deadlines, available time, and a voluntary energy check-in.

It keeps the original tools and adds academic planning:

- Suggests the best task to work on based on your energy and priorities
- Blocks distracting thoughts with a Brain Dump feature
- Tracks your focus sessions and builds streaks
- Sends deadline reminders before you forget
- Connects with Gmail, Slack, and Google Calendar to surface what needs your attention

---

## Features

| Feature | What it does |
|---|---|
| **Today** | One recommended next step, with Do it, Smaller, Change, Rest, and Not now |
| **My Tasks** | Subjects, assignments, readings, revision, deadlines, and study time, beside the original task list |
| **Timetable** | Manual classes, a CSV/JSON upload, or an optional Google Calendar import kept separate from tasks |
| **Your Rhythm** | Optional summary of energy check-ins you explicitly save. It can be edited, disabled, or deleted |
| **Accessibility** | Optional browser voice input, browser or ElevenLabs read-aloud, and MediaPipe hand gestures |
| **Task Manager** | Create, prioritize, and complete tasks with due dates and priority scores |
| **Focus Timer** | Pomodoro-style timer that tracks your focus sessions |
| **Deadline Tracker** | Countdown timers for upcoming deadlines with push notifications |
| **Calendar** | Visual schedule pulled from your tasks and Google Calendar |
| **Progress Dashboard** | Weekly and monthly charts showing tasks completed and time focused |
| **Mindfulness** | Guided breathing and body-scan audio exercises |
| **What next** | Picks one task with fixed rules that use your energy, the deadline, importance, and dread. This is not an OpenAI call |
| **Recommendation log** | Saves what was shown and whether you started, skipped, finished, or ended a focus session on it, for a later recommender |
| **AI task drafting** | OpenAI turns a brain dump into tasks and splits a task into steps. It does not choose what to do next |
| **Energy Control** | Rate your current energy (1–5) to get appropriately scoped task suggestions |
| **Connectors** | Connect Gmail, Slack, and Google Calendar to sync tasks automatically |
| **Chrome Extension** | Quick-add tasks, start timers, and get your next task without switching tabs |
| **Dark / Light Theme** | Premium dark mode (Linear-inspired) and clean light mode (Notion-inspired) with consistent JB Momentum identity |
| **PWA / Installable** | Install directly from Chrome/Safari — works offline, home screen icon on Android and iOS |
| **Push Notifications** | Browser push alerts for deadlines and reminders |

---

## How to Use (No-Code Guide)

> This section is for non-technical users who just want to understand what Doorway does and how to get started using a deployed version.

### Step 1 — Sign up or Log in

Open the app URL in your browser. Click **Sign in with Google** or create an account with your email. Doorway uses secure JWT authentication — your password is never stored in plain text.

### Step 2 — Set your energy level

On the left sidebar (or the bottom sheet on mobile), you will see an **Energy level** slider rated 1–5:

- 1 — Exhausted
- 2 — Low
- 3 — Okay
- 4 — Good
- 5 — Peak

Setting this helps Doorway recommend tasks that match how you feel right now.

### Step 3 — Add your tasks

Go to the **Tasks** page. Add a task with a title, optional due date, estimate, dread, and importance. With your energy level set, the list is ordered by the same rules as What next.

### Step 4 — Let Doorway pick what's next

On the **Today** page, **What next?** shows one task chosen by those rules. **Start Focus** records that you started it and opens the timer with that task linked. **Not now** records a skip and asks for another task.

### Step 5 — Use the Focus Timer

Go to **Focus Timer** and start a Pomodoro session for your chosen task. Doorway logs your session time automatically.

### Step 6 — Set up Blocking Rules

Go to **Blocking Rules** (under the "More" menu). Add the sites and apps that distract you, and optionally whitelist specific sites that should always stay accessible. You can turn blocking on manually, or set a schedule (e.g. weekdays 9am–5pm) so it activates automatically. Blocking also turns on automatically whenever you start a focus session.

> Blocking a **site** is enforced by the Chrome extension on desktop. Blocking an **app** is enforced by the native Android/iOS app — installing the web app on your phone's home screen is not enough; see [Building the Mobile App](#building-the-mobile-app) below.

### Step 7 — Connect your tools (optional)

Go to **Connectors** and link Gmail, Slack, or Google Calendar. Doorway will sync relevant items into your task list automatically every 30 minutes.

### Step 8 — Check your Progress

The **Progress** page shows bar and line charts of your weekly and monthly performance — tasks completed, focus minutes, and your current streak.

### Chrome Extension

Install the extension in Chrome and pin it to your toolbar. From any website you can:

- See your next recommended task, mark it started, skip it, or mark it done
- Quick-add a new task
- Start or stop a focus timer
- Do a Brain Dump (capture thoughts without leaving the page)
- Check blocking status, sync your blocklist, or snooze blocking for 5/15/30 minutes from the **Block** tab

### Mobile App (Android / iOS)

The native mobile app (built with Capacitor) adds app-level blocking on top of everything the web app already does. Once granted the required OS permissions (Usage Access + Accessibility on Android, Family Controls on iOS), starting a focus session or hitting your schedule window will send blocked apps straight back to your home screen. See [Building the Mobile App](#building-the-mobile-app) for setup.

---

## Project Structure

```
Doorway/
├── backend/              # Node.js / Express API server
│   ├── jobs/             # Cron jobs (deadline checker, integration sync)
│   ├── ml/               # Rule-based priority scoring (priorityModel.js)
│   ├── models/           # Mongoose models (Task, RecommendationEvent, Habit, BlockingRule, ...)
│   ├── routes/           # REST handlers (tasks, recommendation-events, priority, habits, blocking, ...)
│   ├── services/         # recommendationLog, plus Gmail, Slack, and Google Calendar
│   ├── utils/            # Email sender, web push helpers
│   ├── server.js         # Entry point
│   └── .env.example      # Environment variable template
│
├── frontend/             # React + Vite web application
│   ├── public/           # Static assets, PWA icons, SVG logos, audio files
│   │   ├── logo-icon.svg          # JB Momentum icon (vector, transparent bg)
│   │   ├── favicon.svg            # Browser tab favicon
│   │   ├── apple-touch-icon.png   # iOS home screen icon (180px)
│   │   └── icons/                 # Full PWA icon set (16–512px, maskable)
│   └── src/
│       ├── components/   # All UI pages and widgets
│       │   └── Logo.jsx  # JB Momentum SVG logo (icon / full / mono variants)
│       ├── contexts/     # React contexts (user session, energy level)
│       ├── hooks/        # Custom React hooks
│       ├── plugins/      # AppBlocker.ts Capacitor plugin interface + web fallback
│       ├── stores/       # Zustand state stores (focus, blocking, timer, theme, ui)
│       └── services/     # Axios API client
│
├── chrome-extension/     # React-based Chrome extension
│   ├── public/
│   │   └── blocked.html  # Standalone page shown when a blocked site is visited
│   └── src/
│       ├── background/service-worker.js  # Enforces site blocking via declarativeNetRequest
│       ├── components/   # Extension popup panels (incl. BlockingTab.jsx)
│       └── utils/        # API client, socket, local storage helpers
│
└── ml-service/            # Python FastAPI microservice — priority scoring model
    ├── main.py            # FastAPI app / entry point
    └── requirements.txt   # fastapi, uvicorn, scikit-learn, numpy, pydantic
```

---

## Tech Stack

### Frontend
- **React 19** with React Router v7
- **TypeScript** — used alongside JS/JSX across config files (`vite.config.ts`, `capacitor.config.ts`) and the Zustand stores
- **Vite** — fast dev server and bundler
- **Tailwind CSS v3** — utility classes wired to CSS custom property design tokens
- **vite-plugin-pwa** — auto-generates `manifest.webmanifest`, service worker, and PWA icon entries; installable Progressive Web App support
- **Zustand** — lightweight state stores (focus, blocking, timer, theme, UI)
- **TanStack Query (React Query)** — server-state fetching and caching
- **Framer Motion** — animation primitives
- **Recharts** — weekly/monthly analytics charts
- **FullCalendar** (`@fullcalendar/react`, `daygrid`, `timegrid`, `interaction`) — the Calendar view
- **Howler** — audio playback for guided Mindfulness exercises
- **Firebase** — client SDK dependency (present in `package.json`, not currently imported under `src/`)
- **Socket.io client** — real-time task and session updates
- **Workbox CLI** — service worker tooling for the PWA build

### Backend
- **Node.js + Express 5**
- **MongoDB + Mongoose** — primary data store
- **Socket.io** — real-time bidirectional events
- **OpenAI API** — AI task recommendations and streaming chat
- **Google OAuth + Google Auth Library** — sign-in and calendar/gmail scopes
- **Nodemailer** — transactional email
- **Web Push** — browser push notifications
- **Helmet + express-rate-limit** — security hardening
- **node-cron** — scheduled jobs (deadline checks every 5 min, integration sync every 30 min)

### Chrome Extension
- **React + Vite** — same stack as frontend, compiled to a Chrome MV3 extension
- **chrome.declarativeNetRequest** — blocks/redirects distracting sites without a background page per-request cost

### Mobile (Capacitor)
- **Capacitor 6** — wraps the frontend web build into native Android and iOS app shells
- **Android (Kotlin)** — `UsageStatsManager` (foreground-app polling) + `AccessibilityService` (instant app-launch detection) to block apps
- **iOS (Swift)** — `FamilyControls` + `ManagedSettings` to shield apps and filter web content at the OS level

### Task ranking and the ML service
- **Live ranker** — `backend/ml/priorityModel.js`. What next, the task list (`GET /api/tasks?energyLevel=`), suggestions, and `POST /api/priority/prioritize` all use these rules: deadline, importance, dread, energy, time of day, and a keyword category.
- **Recommendation log** — `RecommendationEvent` records `shown`, `started`, `completed`, `skipped`, and `session_ended`, each with energy and a snapshot of the task. `backend/services/recommendationLog.js` writes them. `POST /api/recommendation-events` accepts `started` and `skipped` from the clients.
- **Training is paused** — `POST /api/priority/train` does not fit a model. A per-user forest waits until this log is the training source.
- **Python + FastAPI** (`ml-service/`) — `/recommend` returns the same heuristic. scikit-learn and NumPy remain in the file for the unused per-user trainer. The Node API does not call `ML_PRIORITY_URL` to order tasks.

### Infrastructure
- **Frontend** → Vercel
- **Backend** → Render
- **ML Service** → Render
- **Database** → MongoDB Atlas (free tier compatible)

---

## Getting Started (Developer Guide)

### Design System

Doorway uses the **JB Momentum** brand identity. Design tokens live in
`frontend/src/styles.css` as CSS custom properties. Key palette:

| Token | Dark | Light |
|---|---|---|
| `--bg` | `#0f1020` | `#f4f4fe` |
| `--surface` | `#1a1b2e` | `#ffffff` |
| `--indigo` | `#6366f1` | (same) |
| `--violet` | `#7c3aed` | (same) |
| `--cyan` | `#06b6d4` | (same) |

The reusable `<Logo>` component (`src/components/Logo.jsx`) renders the SVG
monogram in four variants: `icon`, `full`, `mono-light`, `mono-dark`.

PWA icons are pre-generated in `public/icons/`. If you modify the logo SVG,
regenerate them by running the Playwright script at
`scripts/generate-icons.mjs` (requires Chromium).

---

### Prerequisites

- **Node.js** v18 or later
- **npm** v9 or later
- A **MongoDB Atlas** account (or a local MongoDB instance)
- A **Google Cloud** project with OAuth 2.0 credentials (for Google sign-in and integrations)
- An **OpenAI API key** (for AI recommendations)
- *(Optional, for mobile app blocking)* **Android Studio** — to build and run the Android app
- *(Optional, for mobile app blocking)* **Xcode** + an **Apple Developer account** with the Family Controls entitlement approved — to build and run the iOS app (see [Building the Mobile App](#building-the-mobile-app))

### Environment Variables

Copy the example file and fill in the values:

```bash
cp backend/.env.example backend/.env
```

| Variable | Description |
|---|---|
| `PORT` | Port the backend listens on (default `4000`) |
| `NODE_ENV` | `development` or `production` |
| `BACKEND_URL` | Public URL of this backend service (used for OAuth redirect URIs) |
| `FRONTEND_URL` | Allowed frontend origin (your Vercel URL) |
| `MONGODB_URI` | MongoDB Atlas connection string |
| `JWT_SECRET` | Secret used to sign access tokens |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret |
| `OPENAI_API_KEY` | OpenAI API key |
| `SLACK_CLIENT_ID` | Slack app client ID |
| `SLACK_CLIENT_SECRET` | Slack app client secret |
| `ML_PRIORITY_URL` | Optional URL of the FastAPI service. Task order does not use it; ranking lives in `backend/ml/priorityModel.js` |
| `VAPID_PUBLIC_KEY` | VAPID public key for web push notifications |
| `VAPID_PRIVATE_KEY` | VAPID private key for web push notifications |
| `VAPID_EMAIL` | `mailto:` address sent with VAPID requests |
| `SMTP_HOST` | SMTP server hostname (e.g. `smtp.gmail.com`) |
| `SMTP_PORT` | SMTP port (default `587`) |
| `SMTP_USER` | SMTP login / sender email address |
| `SMTP_PASS` | SMTP password or app-specific password |
| `ELEVENLABS_API_KEY` | Optional. Enables ElevenLabs read-aloud. The planner works without it |
| `ELEVENLABS_VOICE_ID` | Optional ElevenLabs voice id |

Frontend optional variable: `VITE_BUY_ME_A_COFFEE_URL`. Leave it blank to keep Buy Me a Coffee disabled. Do not point it at someone else's account.

**MongoDB URI** — the value in `.env.example` (`mongodb+srv://<user>:<password>@cluster.mongodb.net/bouncybrain`) is a placeholder, not a real host. Using it as-is fails with `querySrv ENOTFOUND _mongodb._tcp.cluster.mongodb.net` because that hostname doesn't exist in DNS. Get your real connection string from Atlas → Database → Connect → "Connect your application" — it will include an extra subdomain segment (e.g. `cluster0.ab12cde.mongodb.net`), and use that in `MONGODB_URI`.

**VAPID setup** — `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY` are required for web push notifications; the backend throws on startup if they're missing. Generate a key pair with:

```bash
npx web-push generate-vapid-keys
```

Then copy the printed `Public Key` / `Private Key` into `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` in `backend/.env` (and `VITE_VAPID_PUBLIC_KEY` in `frontend/.env.local` — see below).

**Frontend** — create a `.env.local` in the `frontend/` directory:

| Variable | Description |
|---|---|
| `VITE_API_URL` | Full URL of the backend API (e.g. `https://your-backend.onrender.com`) |
| `VITE_VAPID_PUBLIC_KEY` | Same value as `VAPID_PUBLIC_KEY` above |
| `VITE_GOOGLE_CLIENT_ID` | Same value as `GOOGLE_CLIENT_ID` above |
| `VITE_EXTENSION_ID` | *(Optional)* The Chrome extension's ID (shown on its card at `chrome://extensions`). When set, the web app pushes your login into the extension automatically on sign-in/sign-out — see [Syncing auth with the Chrome extension](#syncing-auth-with-the-chrome-extension). Leave unset and the extension just keeps its own separate Google sign-in. |

### Running the Backend

```bash
cd backend
npm install
npm run dev        # starts with --watch for hot reload
```

The server starts on `http://localhost:4000`. Health check: `GET /health`.

### Running the Frontend

```bash
cd frontend
npm install
npm run dev        # starts Vite dev server
```

The app opens at `http://localhost:5173`.

### Loading the Chrome Extension

```bash
cd chrome-extension
npm install
npm run build      # outputs to dist/
```

Then in Chrome:

1. Open `chrome://extensions`
2. Enable **Developer mode** (top right toggle)
3. Click **Load unpacked**
4. Select the `chrome-extension/dist` folder

The extension icon appears in your toolbar.

The extension signs in with Google, same as the web app. Set `VITE_GOOGLE_CLIENT_ID` (same value as `GOOGLE_CLIENT_ID` above) before running `npm run build`, and add `https://<extension-id>.chromiumapp.org/` as an authorized redirect URI on that OAuth client in Google Cloud Console — the extension ID is shown on the `chrome://extensions` card after loading it unpacked once.

### Syncing auth with the Chrome extension

By default the web app and the extension are two independent logins — each does its own Google sign-in. Once you know the extension's ID (from `chrome://extensions`, after loading it unpacked at least once), you can make the web app push your session into the extension automatically so users only sign in once:

1. Set `VITE_EXTENSION_ID` (see [Environment Variables](#environment-variables)) to the extension's ID, and rebuild/restart the frontend.
2. In `chrome-extension/public/manifest.json`, replace the placeholder `"https://your-app.vercel.app/*"` under `"externally_connectable"` with your real deployed frontend origin(s) — this is the allowlist of sites permitted to message the extension, so it must be exact (no broad wildcards) and match wherever `VITE_API_URL`/the frontend is actually hosted. `http://localhost:5173/*` is already included for local dev. Rebuild the extension after changing it.

With both set: signing in on the web app pushes your token, API URL, and profile into the extension's storage (`chrome-extension/src/background/service-worker.js`'s `onMessageExternal` listener), and the extension immediately re-syncs your Focus Shield rules. Signing out clears the extension's session too. If `VITE_EXTENSION_ID` is left unset, this is a no-op and both logins stay fully independent — nothing else changes.

> Security note: `externally_connectable.matches` in the manifest is the actual security boundary — any origin listed there can send the extension a login session. Keep it scoped to domains you control.

### Building the Mobile App

The mobile app is the `frontend/` web app wrapped in native Android/iOS shells via [Capacitor](https://capacitorjs.com), with a native plugin (`AppBlocker`) that adds OS-level app blocking. The web app builds and runs fine without ever touching this — only do this if you need to test or ship app blocking on a phone.

```bash
cd frontend
npm install              # pulls in @capacitor/core, @capacitor/android, @capacitor/ios
npm run build             # builds the web app into dist/
```

**First-time native project setup** (skip if `frontend/android/` or `frontend/ios/` already has a full native project):

```bash
npx cap add android
npx cap add ios
```

**Android:**
1. Merge the permissions and service declarations from `frontend/android/MANIFEST_ADDITIONS.xml` into `frontend/android/app/src/main/AndroidManifest.xml`.
2. `npx cap sync android` to copy the latest web build in.
3. `npx cap open android` to launch Android Studio, then Run.
4. On-device, grant **Usage Access** and enable the **Accessibility Service** for Doorway when prompted (Settings deep-links are provided in-app).

**iOS:**
1. Follow `frontend/ios/SETUP_NOTES.md` — add the FamilyControls, ManagedSettings, and DeviceActivity frameworks, enable the **Family Controls** and **App Groups** capabilities in Xcode, and request the `com.apple.developer.family-controls` entitlement from Apple (this can take time to be approved — request it early).
2. `npx cap sync ios` to copy the latest web build in.
3. `npx cap open ios` to launch Xcode, then Run.
4. On first launch, the app will prompt for Family Controls authorization.

After any change to `frontend/src`, re-run `npm run build && npx cap sync` before testing on-device.

### Running Tests

```bash
cd backend
npm test
```

---

## API Overview

All routes are prefixed with `/api`.

| Route | Purpose |
|---|---|
| `POST /api/auth/register` | Register a new user |
| `POST /api/auth/login` | Email/password login |
| `POST /api/auth/google` | Google OAuth login |
| `GET /api/tasks` | List tasks. `?energyLevel=1-5` sorts open tasks with the heuristic |
| `POST /api/tasks` | Create a task |
| `GET /api/tasks/what-next` | Next task from the heuristic; writes a `shown` event |
| `PUT /api/tasks/:id/complete` | Mark a task complete. Body `energyLevel` is stored on a `completed` event |
| `POST /api/recommendation-events` | Client log for `started` or `skipped` (`taskId`, `energyLevel`) |
| `GET /api/sessions` | List focus sessions |
| `POST /api/sessions` | Log a focus session. Optional `taskId` and `energyLevel` are stored on `session_ended` |
| `GET /api/stats/daily` | Today's task and session summary |
| `GET /api/stats/weekly` | Last 7 days of activity |
| `GET /api/stats/monthly` | Last 30 days of activity |
| `GET /api/habits` | List habits |
| `POST /api/habits` | Create a habit |
| `GET /api/blocking` | Get the current user's blocking rules (sites, apps, whitelist, schedule) |
| `PUT /api/blocking` | Update blocking rules |
| `GET /api/recommendations/mindfulness` | Mindfulness suggestion by energy level |
| `POST /api/integrations/connect` | Connect Gmail / Slack / Google Calendar |
| `POST /api/push/subscribe` | Register for browser push notifications |
| `POST /api/priority/prioritize` | Rank open tasks with the heuristic and write a `shown` event |
| `POST /api/priority/train` | Paused. Returns skipped until recommendation events are the training source |
| `POST /api/ai/stream` | Streaming AI chat response |

Authentication uses **Bearer JWT** tokens. Pass `Authorization: Bearer <token>` on every protected request.

---

## Deployment

### Backend (Render)

1. Create a new Render Web Service and connect this repository.
2. Set the **Root Directory** to `backend`.
3. Set **Runtime** to Docker — Render will use the existing `backend/Dockerfile`.
4. Set all environment variables from `.env.example` in the Render Environment tab.
5. Set `MONGODB_URI` to your MongoDB Atlas connection string.

### ML Service (Render)

1. Create a second Render Web Service in the same Render project as the backend.
2. Set the **Root Directory** to `ml-service/` (or whichever directory contains the ML server).
3. Set **Runtime** to Docker or Node depending on the ML service setup.
4. `ML_PRIORITY_URL` does not drive task order. The backend ranks with `backend/ml/priorityModel.js`. Deploy this service only if you still want the FastAPI process available; `/recommend` returns the same rules, and per-user training stays paused.

### Frontend (Vercel)

1. Import the repository into Vercel.
2. Set the **Root Directory** to `frontend`.
3. Add the following environment variables in the Vercel project settings:
   - `VITE_API_URL` — your Render backend URL
   - `VITE_VAPID_PUBLIC_KEY` — same value as `VAPID_PUBLIC_KEY` on Render
   - `VITE_GOOGLE_CLIENT_ID` — same value as `GOOGLE_CLIENT_ID` on Render
4. Vercel will build and deploy automatically on every push to `main`.

### Mobile Apps (Play Store / App Store)

1. **Android**: Build a signed AAB via Android Studio (Build > Generate Signed Bundle) or `./gradlew bundleRelease`. Because the app requests Usage Access and Accessibility permissions, Google Play requires you to complete a [Permissions Declaration Form](https://support.google.com/googleplay/android-developer/answer/9214102) explaining why — do this before submitting, or the review will be rejected.
2. **iOS**: Archive and upload via Xcode (Product > Archive) to App Store Connect. The `com.apple.developer.family-controls` entitlement must be approved by Apple *before* the build will pass App Review — request it well ahead of your submission date (see [Building the Mobile App](#building-the-mobile-app)).

---

## Contributing

1. Fork the repository and create a feature branch.
2. Make your changes and ensure `npm test` passes.
3. Open a pull request with a clear description of what you changed and why.
4. Keep color usage consistent with the design token system in `styles.css`. Add new colors as CSS custom properties; avoid hardcoded hex values in component files.

Please keep pull requests focused — one feature or fix per PR makes review much faster.

Changes under `frontend/android/` or `frontend/ios/` (Kotlin/Swift) aren't covered by `npm test` — build and run them in Android Studio / Xcode before opening a PR.

---

## Attribution

Doorway is built on JumpyBrain by [tanay9098](https://github.com/tanay9098/JumpyBrain), licensed under the GNU Affero General Public License v3. Required copyright and license notices in [LICENSE](./LICENSE) are unchanged. Personal links that belonged to the original author are not used as this copy's public profile. Put your own name and links in `frontend/src/config/brand.js`.

## License

This project is licensed under the terms in the [LICENSE](./LICENSE) file.

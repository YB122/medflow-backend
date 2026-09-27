# MedFlow backend — appointment & clinic platform API

NestJS + TypeScript + MongoDB + Redis + WebSocket. Full MedFlow slice:
Auth + Users + RBAC, Doctors + schedules + reviews, Appointments with
anti-double-booking, Medical records + prescriptions, Notifications + reminders,
Chat (WebSocket), Payments stub, Admin dashboard/reports.

شرح مختصر (Mixed): الـ `access token` قصير (15m) وفيه `roles` + `permissions`. الـ `refresh token` طويل (7d) ومتخزن في Redis كـ allowlist عشان `logout` و `rotation` يقدروا يلغوه. كل route محمي بـ JWT by default وتفتح بـ `@Public()`. الصلاحيات بتتcheck بـ `RolesGuard` (أي role يكفي) + `PermissionsGuard` (لازم كل permissions). الحجز لا ينتظر الإيميل: `EventsService` حافلة in-memory تنشر `appointment.*` والـ consumers (notifications + mail) تشتغل async. منع الحجز المزدوج بمستويين: check قبل الإنشاء + `unique` partial index على `(doctorId, date, start)` للحالات `PENDING/CONFIRMED` — أي race تتحول لـ `409`.

## Quickstart

```bash
cp .env.example .env
# Make sure MongoDB + Redis are running (Atlas/Upstash or local services)
npm install
npm run start:dev
# seed demo data (specialties, clinic, doctor + schedule)
npm run seed:demo
```

Health: `GET http://localhost:3000/api/v1/health`

## Scripts

| Script | What |
|---|---|
| `npm test` | unit tests (Jest ESM via `--experimental-vm-modules`, 16 tests) |
| `npm run test:e2e` | Jest E2E (needs mongo+redis; `SKIP_E2E=1` for offline skip) |
| `npm run e2e:race` | live double-booking race vs running server (expects 201 + 409) |
| `npm run seed:demo` | seed specialties/clinic/demo doctor via API |
| `npm run build` / `npm run start:prod` | production build + run |

## Auth (`/api/v1/auth`)

| Method | Route | Auth | Notes |
|---|---|---|---|
| POST | `/register` | public | email and/or phone + password (+`asDoctor`), creates PATIENT (or DOCTOR + profile shell), returns access+refresh |
| POST | `/login` | public, 5/min | strict throttle, `{ identifier | email | phone, password }` |
| POST | `/refresh` | public (valid refresh) | rotates refresh jti |
| POST | `/logout` | JWT | body `{ refreshToken }` revokes it |
| GET | `/me` | JWT | current user + roles/permissions |
| POST | `/otp/issue` | JWT | 6-digit, TTL 5m (`otp:user:<id>`) |
| POST | `/otp/verify` | JWT | `{ code }` |

## Appointments (`/api/v1/appointments`)

| Method | Route | Auth |
|---|---|---|
| GET | `/slots?doctorId=&date=` | public |
| POST | `/` | PATIENT (`appointment:create`) |
| GET | `/mine` | PATIENT/DOCTOR/... (own history) |
| PATCH | `/:id/approve`, `/:id/reject` | DOCTOR/STAFF+ (`appointment:approve`) |
| PATCH | `/:id/complete` | DOCTOR+ (confirmed → completed) |
| PATCH | `/:id/cancel` | owner or staff |
| PATCH | `/:id/reschedule` | owner (PATIENT) |

## RBAC

Roles: `SUPER_ADMIN` (bypass) · `ADMIN` · `STAFF` · `DOCTOR` · `PATIENT`

Permissions (see `src/modules/users/roles.seed.ts`):
`doctor:create/update/delete/verify`, `appointment:create/cancel/approve`,
`user:read/update`, `role:assign`, `specialty:manage`, `clinic:manage`, `report:read`

Example — admin-only route:

```ts
@Get()
@Roles('ADMIN', 'SUPER_ADMIN', 'STAFF')
@RequirePermissions('user:read')
list() { ... }
```

## Redis keys

- `refresh:<userId>:<jti>` — refresh allowlist, TTL = refresh TTL
- `otp:user:<id>` — OTP code, TTL 5m
- `doctors:list` — plain doctor-list cache, TTL 60s (invalidated on write/rate)

## Events / mail / reminders

- `EventsService`: in-memory bus, keys `appointment.booked|approved|cancelled`.
- `MailService`: logs in dev; sends via nodemailer when `SMTP_HOST` is set (optional peer, never blocks booking).
- `RemindersService`: every 10 min notifies patients+doctors about tomorrow's PENDING/CONFIRMED appointments (`DISABLE_REMINDERS=1` to turn off).

## Tests

```bash
npm test                                   # guards + auth + appointments units
set SKIP_E2E=1&& npm run test:e2e          # offline-safe E2E (Windows cmd)
npm run e2e:race                           # live race vs running server
```

> Note: Jest runs in ESM mode (`node --experimental-vm-modules`) because
> `@nestjs/*` here ships as ESM. Unit specs use `tsconfig.spec.json`
> (`module: ESNext`, `moduleResolution: bundler`). Jest E2E lazily imports
> `AppModule` so skip-mode doesn't pull the throttler CJS→ESM cycle.

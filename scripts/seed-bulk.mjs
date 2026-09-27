/**
 * Bulk demo seed — LOTS of doctors, staff and patients via public endpoints.
 *
 * Creates (with unique timestamped accounts, safe to run repeatedly):
 *   - 12 doctors (asDoctor → DOCTOR role + auto profile), enriched
 *     (bio/city/price/specialty/experience) + weekly schedules
 *   - 6 staff members (1 per first 6 doctors)
 *   - 30 patients (25 email + 5 phone)
 *   - ~45 appointments spread over the next 10 days (mixed pending/
 *     confirmed/completed/cancelled) + ~20 reviews
 *
 * Usage:
 *   API_BASE=http://localhost:3000/api/v1 node scripts/seed-bulk.mjs
 *
 * Notes:
 *   - Needs mongo + backend running. Admin login (SEED_ADMIN_EMAIL /
 *     SEED_ADMIN_PASSWORD) is only used to create specialties/clinics when
 *     none exist yet.
 *   - Throttle-aware: small delay between calls + one 429 retry.
 */
const BASE = process.env.API_BASE ?? 'http://localhost:3000/api/v1';
const N_DOCTORS = Number(process.env.SEED_DOCTORS ?? 12);
const N_PATIENTS = Number(process.env.SEED_PATIENTS ?? 30);
const N_STAFF_DOCTORS = 6;
const N_APPOINTMENTS = Number(process.env.SEED_APPOINTMENTS ?? 45);
const N_REVIEWS = 20;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function req(method, path, token, body, retry429 = true) {
  await sleep(400); // stay under the global rate limit
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 429 && retry429) {
    console.log('  (429 — cooling down 61s…)');
    await sleep(61_000);
    return req(method, path, token, body, false);
  }
  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  return { status: res.status, data };
}

const ts = Date.now();
let seq = 0;
const uniqPhone = () => `+2010${String(20000000 + (ts % 1000000) + seq++ * 37).slice(-8)}`;

const FIRST = ['Mona', 'Ahmed', 'Sara', 'Karim', 'Heba', 'Omar', 'Nour', 'Layla', 'Mostafa', 'Dina', 'Tarek', 'Rania', 'Youssef', 'Mariam', 'Hassan', 'Salma', 'Khaled', 'Noha', 'Adel', 'Maha'];
const LAST = ['Hassan', 'Samy', 'Mahmoud', 'Adel', 'Fathy', 'Khaled', 'Ibrahim', 'Kamel', 'Sherif', 'Nour', 'Foad', 'Ali', 'Saleh', 'Rashad', 'Aziz'];
const CITIES = ['Cairo', 'Giza', 'Alexandria'];
const COMMENTS = ['Excellent doctor, highly recommended.', 'Very professional and caring.', 'Great experience, short waiting time.', 'Listened carefully and explained everything.', 'Best doctor I visited this year.'];

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const rint = (a, b) => a + Math.floor(Math.random() * (b - a + 1));

function nextDate(offsetDays) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

async function main() {
  console.log(`Seeding ${N_DOCTORS} doctors + staff + ${N_PATIENTS} patients → ${BASE}`);

  // ---- specialties & clinic (admin only when missing) ----
  let specs = (await req('GET', '/specialties')).data ?? [];
  let adminToken = null;
  if (specs.length === 0) {
    const login = await req('POST', '/auth/login', null, {
      email: process.env.SEED_ADMIN_EMAIL ?? 'admin@medflow.local',
      password: process.env.SEED_ADMIN_PASSWORD ?? 'Admin123!',
    });
    if (login.status !== 200) throw new Error('no specialties and admin login failed');
    adminToken = login.data.accessToken;
    for (const name of ['Cardiology', 'Dermatology', 'Pediatrics', 'Orthopedics']) {
      await req('POST', '/specialties', adminToken, { name });
    }
    specs = (await req('GET', '/specialties')).data ?? [];
  }
  console.log(`specialties: ${specs.length}`);
  let clinics = (await req('GET', '/clinics')).data ?? [];
  let clinicId = clinics[0]?._id;
  if (!clinicId && adminToken) {
    const c = await req('POST', '/clinics', adminToken, { name: 'MedFlow Central Clinic', city: 'Cairo' });
    clinicId = c.data?._id;
  }

  // ---- doctors ----
  const doctors = [];
  for (let i = 0; i < N_DOCTORS; i++) {
    const email = `bulk${ts}-doc${i}@medflow.local`;
    const reg = await req('POST', '/auth/register', null, { email, password: 'Password123!', asDoctor: true });
    if (reg.status !== 201 && reg.status !== 200) throw new Error(`doctor register failed: ${reg.status}`);
    const token = reg.data.accessToken;
    const me = await req('GET', '/doctors/me', token);
    const profileId = me.data?._id;
    if (!profileId) throw new Error('auto-created doctor profile missing');
    const spec = specs[i % specs.length];
    const first = FIRST[i % FIRST.length];
    const last = LAST[(i * 3 + 1) % LAST.length];
    await req('PATCH', `/doctors/${profileId}`, token, {
      bio: `Dr. ${first} ${last} — ${spec?.name ?? 'General'}, ${rint(3, 22)}y experience`,
      city: CITIES[i % CITIES.length],
      price: rint(15, 60) * 10,
      specialtyId: spec?._id,
      yearsOfExperience: rint(3, 22),
      ...(clinicId ? { clinicId } : {}),
    });
    await req('POST', `/doctors/${profileId}/schedule`, token, {
      windows: [
        { dayOfWeek: 1, start: '09:00', end: '17:00', slotMinutes: 30 },
        { dayOfWeek: 2, start: '09:00', end: '17:00', slotMinutes: 30 },
        { dayOfWeek: 3, start: '09:00', end: '17:00', slotMinutes: 30 },
        { dayOfWeek: 4, start: '09:00', end: '17:00', slotMinutes: 30 },
        { dayOfWeek: 6, start: '10:00', end: '14:00', slotMinutes: 30 },
      ],
    });
    doctors.push({ token, profileId, email });
    console.log(`  doctor ${i + 1}/${N_DOCTORS} ${email}`);
  }

  // ---- staff (1 per first N_STAFF_DOCTORS doctors) ----
  for (let i = 0; i < Math.min(N_STAFF_DOCTORS, doctors.length); i++) {
    const r = await req('POST', '/doctors/me/staff', doctors[i].token, {
      email: `bulk${ts}-staff${i}@medflow.local`,
      password: 'Password123!',
    });
    console.log(`  staff ${i + 1} → doctor ${i + 1}: ${r.status}`);
  }

  // ---- patients (mix of email + phone) ----
  const patients = [];
  for (let i = 0; i < N_PATIENTS; i++) {
    const body =
      i % 6 === 5
        ? { phone: uniqPhone(), password: 'Password123!' }
        : { email: `bulk${ts}-pat${i}@medflow.local`, password: 'Password123!' };
    const reg = await req('POST', '/auth/register', null, body);
    if (reg.status !== 201 && reg.status !== 200) throw new Error(`patient register failed: ${reg.status}`);
    patients.push({ token: reg.data.accessToken, label: body.email ?? body.phone });
  }
  console.log(`patients: ${patients.length}`);

  // ---- appointments (random doctor/date/slot, realistic status mix) ----
  let booked = 0;
  let attempts = 0;
  while (booked < N_APPOINTMENTS && attempts < N_APPOINTMENTS * 4) {
    attempts += 1;
    const p = pick(patients);
    const d = pick(doctors);
    let slot = null;
    let day = null;
    for (let off = 1; off <= 10 && !slot; off += 1) {
      day = nextDate(off);
      const s = await req('GET', `/appointments/slots?doctorId=${d.profileId}&date=${day}`);
      const free = (Array.isArray(s.data) ? s.data : []).filter((x) => x.available);
      if (free.length > 0) slot = pick(free);
    }
    if (!slot) continue;
    const b = await req('POST', '/appointments', p.token, {
      doctorId: d.profileId,
      date: day,
      start: slot.start,
      reason: 'Follow-up visit',
    });
    if (b.status !== 201 && b.status !== 200) continue;
    booked += 1;
    const roll = Math.random();
    const apptId = b.data._id;
    if (roll < 0.6) {
      await req('PATCH', `/appointments/${apptId}/approve`, d.token);
      if (roll < 0.3) await req('PATCH', `/appointments/${apptId}/complete`, d.token);
    } else if (roll > 0.9) {
      await req('PATCH', `/appointments/${apptId}/cancel`, p.token);
    }
    if (booked % 10 === 0) console.log(`  appointments: ${booked}/${N_APPOINTMENTS}`);
  }
  console.log(`appointments booked: ${booked}`);

  // ---- reviews ----
  for (let i = 0; i < N_REVIEWS; i++) {
    const p = pick(patients);
    const d = pick(doctors);
    await req('POST', `/doctors/${d.profileId}/reviews`, p.token, {
      stars: rint(3, 5),
      comment: pick(COMMENTS),
    });
  }
  console.log(`reviews: ${N_REVIEWS}`);
  console.log('BULK SEED DONE');
}

main().catch((e) => {
  console.error(`BULK SEED FAILED: ${e.message}`);
  process.exit(1);
});

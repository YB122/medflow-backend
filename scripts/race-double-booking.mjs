/**
 * Live double-booking race check (no Jest — avoids the CJS/ESM
 * @nestjs/throttler require(esm) cycle inside jest-runtime).
 *
 * Usage (with mongo + redis up and backend running):
 *   npm run start:dev          # in one terminal
 *   npm run e2e:race           # in another terminal
 *
 * Asserts: Patient A vs Patient B racing the same slot →
 * exactly one 201 and one 409.
 */
const BASE = process.env.API_BASE ?? 'http://localhost:3000/api/v1';

async function req(method, path, token, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  return { status: res.status, data };
}

async function main() {
  const ts = Date.now();
  const health = await req('GET', '/health');
  if (health.status !== 200) throw new Error(`backend not up at ${BASE} (health=${health.status})`);

  const regA = await req('POST', '/auth/register', null, {
    email: `race-a-${ts}@medflow.local`,
    password: 'Password123!',
  });
  const regB = await req('POST', '/auth/register', null, {
    email: `race-b-${ts}@medflow.local`,
    password: 'Password123!',
  });
  if (regA.status !== 201 && regA.status !== 200) throw new Error(`register A failed: ${regA.status}`);
  if (regB.status !== 201 && regB.status !== 200) throw new Error(`register B failed: ${regB.status}`);

  const adminLogin = await req('POST', '/auth/login', null, {
    email: process.env.SEED_ADMIN_EMAIL ?? 'admin@medflow.local',
    password: process.env.SEED_ADMIN_PASSWORD ?? 'Admin123!',
  });
  if (adminLogin.status !== 200) throw new Error('admin login failed — is SEED_ADMIN_* set and server seeded?');
  const adminToken = adminLogin.data.accessToken;

  const docReg = await req('POST', '/auth/register', null, {
    email: `race-doc-${ts}@medflow.local`,
    password: 'Password123!',
  });
  const meRes = await req('GET', '/auth/me', docReg.data.accessToken);
  const doctorUserId = meRes.data?.id;
  if (!doctorUserId) throw new Error('could not resolve doctor user id');

  const docRes = await req('POST', '/doctors', adminToken, {
    userId: doctorUserId,
    bio: 'Race Doctor',
    city: 'Cairo',
    price: 100,
  });
  if (docRes.status !== 201 && docRes.status !== 200) throw new Error(`doctor create failed: ${docRes.status}`);
  const doctorId = docRes.data._id;

  const sched = await req('POST', `/doctors/${doctorId}/schedule`, adminToken, {
    windows: [{ dayOfWeek: 1, start: '09:00', end: '10:00', slotMinutes: 30 }],
  });
  if (sched.status !== 201 && sched.status !== 200) throw new Error(`schedule failed: ${sched.status}`);

  const payload = { doctorId, date: '2026-10-05', start: '09:00' };
  const [r1, r2] = await Promise.all([
    req('POST', '/appointments', regA.data.accessToken, payload),
    req('POST', '/appointments', regB.data.accessToken, payload),
  ]);
  const statuses = [r1.status, r2.status].sort((a, b) => a - b);
  console.log(`race result: ${r1.status} vs ${r2.status}`);
  if (statuses[0] !== 201 || statuses[1] !== 409) {
    throw new Error(`expected [201, 409], got [${statuses}]`);
  }
  console.log('OK: exactly one booking won, the other got 409.');
}

main().catch((e) => {
  console.error(`RACE FAILED: ${e.message}`);
  process.exit(1);
});

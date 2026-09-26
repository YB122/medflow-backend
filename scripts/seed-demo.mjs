/**
 * Demo seed via live API (needs backend + mongo running):
 *   npm run start:dev     # terminal 1
 *   npm run seed:demo     # terminal 2
 *
 * Creates: 2 specialties, 1 clinic, 1 demo doctor profile + weekly schedule.
 * Idempotent-ish: skips creation when list endpoints already return data.
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
  const adminLogin = await req('POST', '/auth/login', null, {
    email: process.env.SEED_ADMIN_EMAIL ?? 'admin@medflow.local',
    password: process.env.SEED_ADMIN_PASSWORD ?? 'Admin123!',
  });
  if (adminLogin.status !== 200) throw new Error('admin login failed — check SEED_ADMIN_* and server logs');
  const token = adminLogin.data.accessToken;
  console.log('admin ok');

  const specs = await req('GET', '/specialties', token);
  if (Array.isArray(specs.data) && specs.data.length === 0) {
    for (const s of [
      { name: 'Cardiology', description: 'Heart and vascular care' },
      { name: 'Dermatology', description: 'Skin care' },
      { name: 'Pediatrics', description: 'Child care' },
    ]) {
      await req('POST', '/specialties', token, s);
    }
    console.log('specialties seeded');
  } else {
    console.log(`specialties: ${(specs.data ?? []).length} already present`);
  }

  const clinics = await req('GET', '/clinics', token);
  let clinicId = clinics.data?.[0]?._id;
  if (!clinicId) {
    const c = await req('POST', '/clinics', token, {
      name: 'MedFlow Central Clinic',
      city: 'Cairo',
      address: '12 Tahrir St',
      phone: '+20 2 0000000',
    });
    clinicId = c.data?._id;
    console.log('clinic seeded');
  } else {
    console.log('clinic already present');
  }

  const doctors = await req('GET', '/doctors', token);
  if ((doctors.data?.items?.length ?? doctors.data?.length ?? 0) === 0) {
    const docReg = await req('POST', '/auth/register', null, {
      email: `demo-doctor-${Date.now()}@medflow.local`,
      password: 'Password123!',
    });
    const meRes = await req('GET', '/auth/me', docReg.data.accessToken);
    const specialtyId = (await req('GET', '/specialties', token)).data?.[0]?._id;
    const docRes = await req('POST', '/doctors', token, {
      userId: meRes.data.id,
      specialtyId,
      clinicId,
      bio: 'Demo doctor — cardiology, 10y experience',
      city: 'Cairo',
      price: 250,
    });
    const doctorId = docRes.data?._id;
    if (doctorId) {
      await req('POST', `/doctors/${doctorId}/schedule`, token, {
        windows: [
          { dayOfWeek: 1, start: '09:00', end: '13:00', slotMinutes: 30 },
          { dayOfWeek: 1, start: '15:00', end: '18:00', slotMinutes: 30 },
          { dayOfWeek: 2, start: '09:00', end: '14:00', slotMinutes: 30 },
          { dayOfWeek: 3, start: '09:00', end: '14:00', slotMinutes: 30 },
        ],
      });
      console.log(`demo doctor ready: ${doctorId}`);
    }
  } else {
    console.log('doctors already present — skipping demo doctor');
  }
  console.log('SEED DONE');
}

main().catch((e) => {
  console.error(`SEED FAILED: ${e.message}`);
  process.exit(1);
});

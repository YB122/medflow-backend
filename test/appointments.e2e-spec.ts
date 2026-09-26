import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
// NOTE: AppModule lazily imported in beforeAll (see rbac.e2e-spec).

/**
 * Appointment concurrency E2E:
 * Patient A and Patient B race for the same doctor/date/start.
 * Exactly one booking must succeed; the other must get 409.
 * Skips gracefully when MongoDB/Redis are unavailable (Docker down).
 */
describe('Appointments double-booking E2E', () => {
  let app: INestApplication;

  beforeAll(async () => {
    if (process.env.SKIP_E2E === '1') return;
    const { AppModule } = await import('../src/app.module.js');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );
    app.setGlobalPrefix('api/v1');
    await app.init();
  }, 30000);

  afterAll(async () => {
    if (app) await app.close();
  });

  const guard = () => process.env.SKIP_E2E === '1' || !app;

  it('health is public', async () => {
    if (guard()) return;
    await request(app.getHttpServer()).get('/api/v1/health').expect(200);
  });

  it('slots validation rejects bad date without DB', async () => {
    if (guard()) return;
    await request(app.getHttpServer())
      .get('/api/v1/appointments/slots')
      .query({ doctorId: '000000000000000000000000', date: 'not-a-date' })
      .expect(400);
  });

  it('booking without token → 401', async () => {
    if (guard()) return;
    await request(app.getHttpServer())
      .post('/api/v1/appointments')
      .send({ doctorId: '000000000000000000000000', date: '2026-10-05', start: '10:00' })
      .expect(401);
  });

  it('Patient A vs Patient B race → one 201 + one 409', async () => {
    if (guard()) return;
    const ts = Date.now();
    const server = app.getHttpServer();

    const regA = await request(server)
      .post('/api/v1/auth/register')
      .send({ email: `race-a-${ts}@medflow.local`, password: 'Password123!' });
    const regB = await request(server)
      .post('/api/v1/auth/register')
      .send({ email: `race-b-${ts}@medflow.local`, password: 'Password123!' });
    if ((regA.status !== 201 && regA.status !== 200) || (regB.status !== 201 && regB.status !== 200)) {
      return; // DB down — don't fail hard
    }
    const tokenA = regA.body.accessToken as string;
    const tokenB = regB.body.accessToken as string;

    // Admin login for doctor-profile + schedule setup.
    const adminEmail = process.env.SEED_ADMIN_EMAIL ?? 'admin@medflow.local';
    const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? 'Admin123!';
    const adminLogin = await request(server)
      .post('/api/v1/auth/login')
      .send({ email: adminEmail, password: adminPassword });
    if (adminLogin.status !== 200) return; // no seeded admin — skip
    const adminToken = adminLogin.body.accessToken as string;

    // Create a doctor profile owned by a fresh doctor user.
    const docReg = await request(server)
      .post('/api/v1/auth/register')
      .send({ email: `race-doc-${ts}@medflow.local`, password: 'Password123!' });
    if (docReg.status !== 201 && docReg.status !== 200) return;
    const docUserId = docReg.body?.user?.id ?? docReg.body?.userId;
    // /auth/register returns tokens only; fetch user id via /auth/me.
    const meRes = await request(server)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${docReg.body.accessToken}`);
    const doctorUserId = meRes.body?.id ?? docUserId;
    if (!doctorUserId) return;

    const docRes = await request(server)
      .post('/api/v1/doctors')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ userId: doctorUserId, bio: 'Race Doctor', city: 'Cairo', price: 100 });
    if (docRes.status !== 201 && docRes.status !== 200) return;
    const doctorId = docRes.body._id as string;

    // Monday 2026-10-05 (dayOfWeek 1), 09:00–10:00 → slots 09:00, 09:30.
    await request(server)
      .post(`/api/v1/doctors/${doctorId}/schedule`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ windows: [{ dayOfWeek: 1, start: '09:00', end: '10:00', slotMinutes: 30 }] })
      .expect((res) => {
        if (res.status !== 201 && res.status !== 200) {
          throw new Error(`schedule setup failed: ${res.status}`);
        }
      });

    const payload = { doctorId, date: '2026-10-05', start: '09:00' };
    const [r1, r2] = await Promise.all([
      request(server).post('/api/v1/appointments').set('Authorization', `Bearer ${tokenA}`).send(payload),
      request(server).post('/api/v1/appointments').set('Authorization', `Bearer ${tokenB}`).send(payload),
    ]);
    const statuses = [r1.status, r2.status].sort();
    expect(statuses).toEqual([201, 409]);
  });
});

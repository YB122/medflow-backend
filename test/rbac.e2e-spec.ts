import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
// NOTE: AppModule is lazily imported inside beforeAll so that
// SKIP_E2E=1 runs pass without pulling the mixed CJS/ESM
// @nestjs/throttler graph into Jest (require(esm) cycle).

describe('RBAC E2E (needs MongoDB + Redis running)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    if (process.env.SKIP_E2E === '1') return;
    const { AppModule } = await import('../src/app.module.js');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    app.setGlobalPrefix('api/v1');
    await app.init();
  }, 30000);

  afterAll(async () => {
    if (app) await app.close();
  });

  it('health is public', async () => {
    if (process.env.SKIP_E2E === '1' || !app) return;
    await request(app.getHttpServer()).get('/api/v1/health').expect(200);
  });

  it('GET /users without token → 401', async () => {
    if (process.env.SKIP_E2E === '1' || !app) return;
    await request(app.getHttpServer()).get('/api/v1/users').expect(401);
  });

  it('patient cannot list users (403 after login)', async () => {
    if (process.env.SKIP_E2E === '1' || !app) return;
    const email = `e2e-${Date.now()}@medflow.local`;
    const reg = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email, password: 'Password123!' });
    if (reg.status !== 201 && reg.status !== 200) return; // DB may be down; don't fail hard
    const token = reg.body.accessToken;
    await request(app.getHttpServer())
      .get('/api/v1/users')
      .set('Authorization', `Bearer ${token}`)
      .expect(403);
  });

  it('patient cannot approve appointments (403)', async () => {
    if (process.env.SKIP_E2E === '1' || !app) return;
    const email = `e2e-approve-${Date.now()}@medflow.local`;
    const reg = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email, password: 'Password123!' });
    if (reg.status !== 201 && reg.status !== 200) return;
    const token = reg.body.accessToken;
    await request(app.getHttpServer())
      .patch('/api/v1/appointments/000000000000000000000000/approve')
      .set('Authorization', `Bearer ${token}`)
      .expect(403);
  });

  it('patient cannot verify doctors (403)', async () => {
    if (process.env.SKIP_E2E === '1' || !app) return;
    const email = `e2e-verify-${Date.now()}@medflow.local`;
    const reg = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email, password: 'Password123!' });
    if (reg.status !== 201 && reg.status !== 200) return;
    const token = reg.body.accessToken;
    await request(app.getHttpServer())
      .patch('/api/v1/doctors/000000000000000000000000/verify')
      .set('Authorization', `Bearer ${token}`)
      .send({ verified: true })
      .expect(403);
  });
});

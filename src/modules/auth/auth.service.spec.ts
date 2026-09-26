import { jest } from '@jest/globals';
import { AuthService } from './auth.service.js';
import { UnauthorizedException, ConflictException, BadRequestException } from '@nestjs/common';
import bcrypt from 'bcryptjs';

describe('AuthService (login logic)', () => {
  const makeService = (user: any) => {
    const users = {
      findByEmailWithSecret: jest.fn<any>().mockResolvedValue(user),
      findByPhoneWithSecret: jest.fn<any>().mockResolvedValue(user),
      findByIdentifierWithSecret: jest.fn<any>().mockResolvedValue(user),
      findById: jest.fn<any>(),
      create: jest.fn<any>().mockImplementation((input: any) => Promise.resolve({ _id: 'u9', ...input })),
      roleNames: () => user?.__roles ?? ['PATIENT'],
      collectPermissions: () => user?.__perms ?? ['appointment:create'],
    } as any;
    const jwt = { signAsync: jest.fn<any>().mockResolvedValue('signed-token') } as any;
    const redis = {
      set: jest.fn<any>(),
      get: jest.fn<any>(),
      del: jest.fn<any>(),
      refreshKey: (u: string, j: string) => `refresh:${u}:${j}`,
    } as any;
    return { service: new AuthService(users, jwt, redis), users, jwt, redis };
  };

  it('rejects unknown email', async () => {
    const { service } = makeService(null);
    await expect(service.login('a@b.c', 'x')).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects unknown phone', async () => {
    const { service } = makeService(null);
    await expect(service.login('+201001234567', 'x')).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects wrong password', async () => {
    // bcrypt hash for 'correct-password'
    const hash = await bcrypt.hash('correct-password', 4);
    const { service } = makeService({
      _id: 'u1',
      email: 'p@medflow.local',
      passwordHash: hash,
      status: 'ACTIVE',
    });
    await expect(service.login('p@medflow.local', 'wrong')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects suspended account', async () => {
    const hash = await bcrypt.hash('pw123456', 4);
    const { service } = makeService({
      _id: 'u1',
      email: 'p@medflow.local',
      passwordHash: hash,
      status: 'SUSPENDED',
    });
    await expect(service.login('p@medflow.local', 'pw123456')).rejects.toThrow();
  });

  it('logs in with phone identifier', async () => {
    const hash = await bcrypt.hash('pw123456', 4);
    const { service, users } = makeService({
      _id: 'u2',
      phone: '+201001234567',
      passwordHash: hash,
      status: 'ACTIVE',
    });
    const tokens = await service.login('+201001234567', 'pw123456');
    expect(tokens.accessToken).toBe('signed-token');
    expect(users.findByIdentifierWithSecret).toHaveBeenCalledWith('+201001234567');
  });

  it('registers with phone only', async () => {
    const { service, users } = makeService(null);
    users.findById.mockResolvedValue({ _id: 'u9', phone: '+201001234567', roles: [] });
    const tokens = await service.register(undefined, '+201001234567', 'Password123!');
    expect(tokens.accessToken).toBe('signed-token');
    expect(users.create).toHaveBeenCalledWith(
      expect.objectContaining({ phone: '+201001234567' }),
      ['PATIENT'],
    );
  });

  it('rejects register with neither email nor phone', async () => {
    const { service } = makeService(null);
    await expect(service.register(undefined, undefined, 'Password123!')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rejects duplicate phone', async () => {
    const { service } = makeService({ _id: 'u3', phone: '+201001234567' });
    await expect(service.register(undefined, '+201001234567', 'Password123!')).rejects.toBeInstanceOf(
      ConflictException,
    );
  });
});

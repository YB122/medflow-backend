import { SetMetadata } from '@nestjs/common';

export const ROLES_KEY = 'roles';
/** e.g. @Roles('ADMIN', 'STAFF') */
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);

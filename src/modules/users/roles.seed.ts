/**
 * Canonical RBAC catalog for MedFlow.
 * Roles map to permission sets. SUPER_ADMIN bypasses checks in guards.
 */
export const PERMISSIONS = {
  DOCTOR_CREATE: 'doctor:create',
  DOCTOR_UPDATE: 'doctor:update',
  DOCTOR_DELETE: 'doctor:delete',
  DOCTOR_VERIFY: 'doctor:verify',
  APPOINTMENT_CREATE: 'appointment:create',
  APPOINTMENT_CANCEL: 'appointment:cancel',
  APPOINTMENT_APPROVE: 'appointment:approve',
  USER_READ: 'user:read',
  USER_UPDATE: 'user:update',
  ROLE_ASSIGN: 'role:assign',
  SPECIALTY_MANAGE: 'specialty:manage',
  CLINIC_MANAGE: 'clinic:manage',
  REPORT_READ: 'report:read',
} as const;

export const DEFAULT_ROLES: Record<string, string[]> = {
  SUPER_ADMIN: ['*'],
  ADMIN: [
    'doctor:create',
    'doctor:update',
    'doctor:delete',
    'doctor:verify',
    'appointment:approve',
    'user:read',
    'user:update',
    'role:assign',
    'specialty:manage',
    'clinic:manage',
    'report:read',
  ],
  STAFF: ['appointment:approve', 'user:read', 'doctor:verify'],
  DOCTOR: ['appointment:approve', 'doctor:update'],
  PATIENT: ['appointment:create', 'appointment:cancel'],
};

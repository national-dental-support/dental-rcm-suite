export type Role = 'Super Admin' | 'Admin' | 'Training Admin' | 'Manager' | 'User' | 'AR Specialist';

/** Every role the suite recognises, most privileged first. */
export const ALL_ROLES: readonly Role[] = [
  'Super Admin',
  'Admin',
  'Training Admin',
  'Manager',
  'AR Specialist',
  'User',
];

/** Roles that may reach administrative screens. */
export const ADMIN_ROLES: readonly string[] = ['Admin', 'Super Admin'];

/** Roles that may reach manager screens. */
export const MANAGER_ROLES: readonly string[] = ['Manager', 'Admin', 'Super Admin'];

export interface PermissionSet {
  manageQueues?: boolean;
  canEditDefaults?: boolean;
  reassignToAnotherUser?: boolean;
  escalateClaim?: boolean;
  viewUnassigned?: boolean;
  trainingAdmin?: boolean;
  teamAdmin?: boolean;
  orgAdmin?: boolean;
  techMonitoringAccess?: boolean;
  [k: string]: boolean | undefined;
}

export interface UserDto {
  id: string;
  name: string;
  email: string;
  role: Role;
  active?: boolean;
  archived?: boolean;
  createdAt?: string;
  lastLoginAt?: string;
  permissions?: PermissionSet;
}

export interface UserCreateDto {
  firstName: string;
  lastName:  string;
  email: string;
  role: Role;
  permissions?: PermissionSet;
}

export interface UserUpdateDto extends Partial<UserCreateDto> {}

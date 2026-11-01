type Roles = 'RCM Analyst' | 'Admin' | 'Super Admin';

export interface IRole {
  uid: string;
  name: Roles;
}

export interface IPolicy {
  uid: string;
  name: string;
  description: string;
  role_id: string;
}

export type Role = 'RCM Analyst' | 'Admin' | 'Super Admin' | '--'

// UID should match what's in the database
export interface IRole {
  id:string;
  name:Role
}


export const roles: IRole[] = [{ name: 'Admin', id: '2'}, {name: 'RCM Analyst', id: '1'}, { name: 'Super Admin', id: '3'}, {name: '--', id:'0'}]
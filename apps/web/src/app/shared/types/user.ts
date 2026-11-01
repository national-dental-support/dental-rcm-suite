import { ILocationAssignment } from "./location-assignments";


export type AllowedRoles = 'RCM-A' | 'RCM-M' | 'CFO' | 'ADMIN' | 'OWNER' | 'Unassigned'



/**
 * Interface representing a user entity.
 */
export interface IUser {
  /**
   * Unique identifier for the user.
   * @description Used to identify the user across the system.
   */
  id: string;

  /**
   * First name of the user.
   * @description Represents the user's first name.
   */
  first_name: string;

  /**
   * Last name of the user.
   * @description Represents the user's last name.
   */
  last_name: string;

    /**
   * Customer ID of client who this user belongs to.
   * @description 
   */
  customer_id?: string; // optional so that it doesn't break, should be included everywhere (tech debt)

  role_id?: string; // optional so that it doesn't break, should be included everywhere (tech debt)
  /**
   * Email address of the user.
   * @description Used for user communication and login purposes.
   */
  email: string;

  /**
   * Date and time when the user was created.
   * @description Used for record keeping and auditing purposes.
   */
  created_at?: string;

  /**
   * Date and time when the user's information was last updated.
   * @description Helps in tracking changes and maintaining data integrity.
   */
  updated_at?: string;

    /**
   * Array of location assignments for the user.
   * @description Represents the user's assignments to various locations
   */

  locationAssignments: ILocationAssignment[];

  archived?: boolean;
  
  disabled?: boolean; 

  avatar_image_url: string | null
};

export interface UpdateAppWithUserStatePayload {
  azureIdToken: string;
  firstName: string;
  lastName: string;
  email: string;
}
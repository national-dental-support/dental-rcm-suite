/**
 * Interface representing a user entity.
 *
 * Tech debt ? Maybe? - Should we be using snake casing or am I just being too picky about it?
 */
export interface IUser {
  /**
   * Unique identifier for the user.
   * @description Used to identify the user across the system.
   */
  uid: string;

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
  customer_id: string;

  role_id: string;
  /**
   * Email address of the user.
   * @description Used for user communication and login purposes.
   */
  email: string;

  /**
   * Date and time when the user was created.
   * @description Used for record keeping and auditing purposes.
   */
  created_at?: Date;

  /**
   * Date and time when the user's information was last updated.
   * @description Helps in tracking changes and maintaining data integrity.
   */
  updated_at?: Date;

  archived?: boolean; // saved as a tiny int in the DB

  disabled?: boolean; // saved as a tiny int in the DB

  avatar_image_url?: string;
}

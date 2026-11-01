export interface ICustomer {
  /**
   * Unique identifier for the user.
   * @description Used to identify the user across the system.
   */
  uid: string;

  /**
   * Name of customer
   * @description Represents the user's first name.
   */
  name: string;

  /**
   * Date and time when the customer was created.
   * @description Used for record keeping and auditing purposes.
   */
  created_at?: Date;

  /**
   * Date and time when the customer's information was last updated.
   * @description Helps in tracking changes and maintaining data integrity.
   */
  updated_at?: Date;
}

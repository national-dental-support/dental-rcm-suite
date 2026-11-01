/**
 * Interface representing the assignment of a user to a location with a specific role.
 */
export interface ILocationAssignments {
  /**
   * The unique identifier of the user.
   * @type {number}
   */
  user_id: number;
  /**
   *
   * @type {string}
   */
  first_name: string;
  /**
   *
   * @type {string}
   */

  last_name: string;

  /**
   * The email of the role assigned to the user.
   * @type {string}
   */
  email: string;

  /**
   * The unique identifier of the role assigned to the user.
   * @type {number}
   */
  role_id: number;

  /**
   * The unique identifier of the location.
   * @type {number}
   */
  location_id: number;

  /**
   * The unique identifier of the location.
   * @type {number}
   */
  customer_id: number;

  /**
   *
   * @type {string}
   */
  created_at: string;

  /**
   *
   * @type {string}
   */
  updated_at: string;
}

/**
 * Interface representing the details of a location. (deprecating)
 */
export interface ILocations {
  /**
   * The unique identifier of the location.
   * @type {number}
   */
  uid: number;

  /**
   * The name of the location.
   * @type {string}
   */
  name: string;

  /**
   * The first line of the location's street address.
   * @type {string}
   */
  street_1: string;

  /**
   * The second line of the location's street address, or null if not applicable.
   * @type {(string | null)}
   */
  street_2: string | null;

  /**
   * The city where the location is situated.
   * @type {string}
   */
  city: string;

  /**
   * The state where the location is situated.
   * @type {string}
   */
  state: string;

  /**
   * The zip code of the location.
   * @type {string}
   */
  zip: string;

  /**
   * The first name of the primary contact at the location.
   * @type {string}
   */
  primary_contact_first_name: string;

  /**
   * The last name of the primary contact at the location.
   * @type {string}
   */
  primary_contact_last_name: string;

  /**
   * The email address of the primary contact at the location.
   * @type {string}
   */
  primary_contact_email: string;

  /**
   * The phone number of the primary contact at the location.
   * @type {string}
   */
  primary_contact_phone_number: string;

  /**
   * The unique identifier of the practice associated with the location.
   * @type {number}
   */
  practice_id: number;
}

/**
 * Interface representing a claim assignment entity.
 */
export interface IClaimAssignment {
  /**
   * Unique identifier for the claim assignment.
   * Auto-incrementing primary key.
   */
  uid: number;

  /**
   * Identifier for the customer associated with the claim.
   * Corresponds to the customer_id field in the database.
   */
  customer_id: string;

  /**
   * Identifier for the claim.
   * Corresponds to the claim_id field in the database.
   */
  claim_id: string;

  /**
   * Identifier for the user assigned to the claim.
   * Corresponds to the user_id field in the database.
   */
  user_id?: string;

  /**
   * Email of the user assigned to the claim.
   * Corresponds to the email field in the database.
   */
  first_name?: string;

  last_name?: string;

  avatar_image_url?: string | null;

  email: string;

  /**
   * Indicates whether the claim is assigned.
   * Corresponds to the assigned field in the database.
   */
  assigned: boolean;

  /**
   * Timestamp when the claim assignment was created.
   * Automatically set to the current date and time when a record is created.
   */
  created_at: Date;

  /**
   * Timestamp when the claim assignment was last updated.
   * Automatically set to the current date and time when a record is created or updated.
   */
  updated_at: Date;
}

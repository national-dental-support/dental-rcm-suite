/**
 * Interface representing a Feedback record.
 */
export interface IFeedback {
  /**
   * Unique identifier for the feedback (Primary Key).
   */
  uid: string;

  /**
   * Identifier of the user who saved the feedback.
   */
  user_id: string;

  /**
   * Email of the user who saved the feedback.
   */
  email: string;

  /**
   * Identifier of the claim related to the feedback.
   */
  claim_id: string;

  /**
   * CARC CODE of the remedy (optional, coming soon, null as default)
   */
  carc?: string;

  /**
   * Identifier of the remedy (optional, coming soon, null as default).
   * @default null
   */
  remedy_id?: string;

  /**
   * The question posed by the user.
   */
  question: string;

  /**
   * The response to the user's question.
   */
  response: string;

  /**
   * Timestamp when the feedback was created.
   * Should be in ISO 8601 format (e.g., "2024-08-21T12:34:56Z").
   */
  created_at: string;

  /**
   * Timestamp when the feedback was last updated.
   * Should be in ISO 8601 format (e.g., "2024-08-21T12:34:56Z").
   */
  updated_at: string;
}

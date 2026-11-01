import { Request, Response } from 'express';
import sql from 'mssql';
import Database from '../../modules/db';
import chalk from 'chalk';
import { IClaimAssignment } from '../../models/claim-assignment/index';
/**
 *
 */
export class ClaimAssignmentsController {
  private pool: sql.ConnectionPool;
  /**
   *
   */
  constructor() {
    const databaseInstance = Database.getInstance();
    this.pool = databaseInstance.getPool();
  }

  /**
   * Used to check to see if a user is already assigned to claim, if record is returned,
   * the client will check the email of that record to see if it matches the user
   * that is signed in
   */
  public update = async (req: Request, res: Response) => {
    try {
      const claimAssignmentObject: IClaimAssignment = req.body;

      console.log(
        chalk.white.bgBlueBright(
          'ClaimAssignmentsController: Attempting to assign user to claim.',
        ),
      );

      if (!this.pool) {
        console.log(
          chalk.white.bgRedBright(
            'ClaimAssignmentsController; Database pool unavailable.',
          ),
        );

        return res.status(500).send({
          message: 'ClaimAssignmentsController; Database pool unavailable.',
        });
      }

      if (!claimAssignmentObject.customer_id) {
        console.log(
          chalk.white.bgRedBright(
            'ClaimAssignmentsController; No customer ID found in the request body.',
          ),
        );

        return res.status(500).send({
          message:
            'ClaimAssignmentsController; No customer ID found in the request body.',
        });
      }

      if (!claimAssignmentObject.claim_id) {
        console.log(
          chalk.white.bgRedBright(
            'ClaimAssignmentsController; No claim ID found in the request body.',
          ),
        );

        return res.status(500).send({
          message:
            'ClaimAssignmentsController; No claim ID found in the request body.',
        });
      }

      if (!claimAssignmentObject.first_name) {
        console.log(
          chalk.white.bgRedBright(
            'ClaimAssignmentsController; No user first name found in the request body.',
          ),
        );

        return res.status(500).send({
          message:
            'ClaimAssignmentsController; No user first name found in the request body.',
        });
      }

      if (!claimAssignmentObject.last_name) {
        console.log(
          chalk.white.bgRedBright(
            'ClaimAssignmentsController; No user last name found in the request body.',
          ),
        );

        return res.status(500).send({
          message:
            'ClaimAssignmentsController; No user last nam found in the request body.',
        });
      }

      if (!claimAssignmentObject.email) {
        console.log(
          chalk.white.bgRedBright(
            'ClaimAssignmentsController; No user email found in the request body.',
          ),
        );

        return res.status(500).send({
          message:
            'ClaimAssignmentsController; No user email found in the request body.',
        });
      }

      if (
        null === claimAssignmentObject.assigned ||
        undefined === claimAssignmentObject.assigned
      ) {
        console.log(
          chalk.white.bgRedBright(
            'ClaimAssignmentsController; Assigned status missing from request body.',
          ),
        );

        return res.status(500).send({
          message:
            'ClaimAssignmentsController; Assigned status missing from request body.',
        });
      }

      console.log(
        chalk.white.bgGreenBright(
          'ClaimAssignmentsController; All tests passed',
        ),
      );

      console.log(
        chalk.white.bgBlueBright(
          'ClaimAssignmentsController: Updating claim assigned user email.',
        ),
      );

      if (true === claimAssignmentObject.assigned) {
        console.log(
          chalk.white.bgBlueBright(
            `ClaimAssignmentsController: Assigning ${claimAssignmentObject.first_name} ${claimAssignmentObject.last_name} : ${claimAssignmentObject.email} to claim ${claimAssignmentObject.claim_id}`,
          ),
        );

        await this.pool
          .request()
          .input('claim_id', sql.NVarChar, claimAssignmentObject.claim_id)
          .input(
            'assigned_user_first_name',
            sql.NVarChar,
            claimAssignmentObject.first_name,
          )
          .input(
            'assigned_user_last_name',
            sql.NVarChar,
            claimAssignmentObject.last_name,
          )
          .input(
            'assigned_user_email',
            sql.NVarChar,
            claimAssignmentObject.email,
          )
          .input(
            'assigned_user_avatar_image_url',
            sql.NVarChar,
            claimAssignmentObject.avatar_image_url,
          ).query(`
          UPDATE ClaimsTracking
          SET assigned_user_email = @assigned_user_email,
              assigned_user_first_name = @assigned_user_first_name,
              assigned_user_last_name = @assigned_user_last_name,
              assigned_user_avatar_image_url = @assigned_user_avatar_image_url
          WHERE uid = @claim_id;
        `);

        return res.status(201).send({
          message: `Claim successfull assigned to ${claimAssignmentObject.first_name} ${claimAssignmentObject.last_name} : ${claimAssignmentObject.email}.`,
        });
      } else {
        console.log(
          chalk.white.bgBlueBright(
            `ClaimAssignmentsController: Unssigning ${claimAssignmentObject.first_name} ${claimAssignmentObject.last_name} : ${claimAssignmentObject.email} from claim ${claimAssignmentObject.claim_id}`,
          ),
        );

        await this.pool
          .request()
          .input('claim_id', sql.NVarChar, claimAssignmentObject.claim_id)
          .query(`
          UPDATE ClaimsTracking
          SET assigned_user_email = null,
              assigned_user_first_name = null,
              assigned_user_last_name = null,
              assigned_user_avatar_image_url = null

          WHERE uid = @claim_id;
        `);
        return res
          .status(201)
          .send({ message: 'Claim successfull unassigned.' });
      }
    } catch (error) {
      console.log(
        chalk.white.bgRedBright(
          'ClaimAssignmentsController; Unable to save claim assignment.',
          error,
        ),
      );

      return res.status(500).send({
        message: 'Internal server error',
      });
    }
  };
}

export const claimAssignmentsController = new ClaimAssignmentsController();

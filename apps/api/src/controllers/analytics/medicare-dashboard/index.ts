import { Request, Response } from 'express';
import Database from '../../../modules/db';
import chalk from 'chalk';
import { CptAndClaimCountsByDOS } from './cpt-and-claim-counts';
import { ChargesVsMedicareByDOS } from './charges-vs-medicare';
import { PaymentsVsMedicareByDOS } from './payments-vs-medicare';
import { UncollectedMedicarePerClaimByDOS } from './uncollected-medicare-per-claim';
import { UncollectedMCRPerClaimByDOS } from './uncollected-mcr-per-claim';
import { UncollectedMedicarePerClaimMixByDOS } from './uncollected-medicare-per-claim-mix';
import { MedicareByCptGroup } from '../medicare-dashboard/medicare-by-cpt-group';
import { UncollectedMedicareByCptGroup } from '../medicare-dashboard/uncollected-medicare-by-cpt-group';

export class MedicareDashboardController {
  private cptAndClaimCountsByDOS: CptAndClaimCountsByDOS;
  private chargesVsMedicareByDOS: ChargesVsMedicareByDOS;
  private paymentsVsMedicareByDOS: PaymentsVsMedicareByDOS;
  private uncollectedMedicarePerClaimByDOS: UncollectedMedicarePerClaimByDOS;
  private uncollectedMCRPerClaimByDOS: UncollectedMCRPerClaimByDOS;
  private uncollectedMedicarePerClaimMixByDOS: UncollectedMedicarePerClaimMixByDOS;
  private medicareByCptGroup: MedicareByCptGroup;
  private uncollectedMedicareByCptGroup: UncollectedMedicareByCptGroup;

  constructor() {
    this.cptAndClaimCountsByDOS = new CptAndClaimCountsByDOS();
    this.chargesVsMedicareByDOS = new ChargesVsMedicareByDOS();
    this.paymentsVsMedicareByDOS = new PaymentsVsMedicareByDOS();
    this.uncollectedMedicarePerClaimByDOS = new UncollectedMedicarePerClaimByDOS();
    this.uncollectedMCRPerClaimByDOS = new UncollectedMCRPerClaimByDOS();
    this.uncollectedMedicarePerClaimMixByDOS = new UncollectedMedicarePerClaimMixByDOS();
    this.medicareByCptGroup = new MedicareByCptGroup();
    this.uncollectedMedicareByCptGroup = new UncollectedMedicareByCptGroup();
  };
   /**
   * Handler to fetch CPT and Claim Counts by Date of Service.
   * @param req - Express Request object.
   * @param res - Express Response object.
   * @returns Promise resolving to an Express Response.
   */
   public getCptAndClaimCountsByDOS = async (req: Request, res: Response): Promise<Response> => {
    try {
      // Delegate the request to CptAndClaimCountsByDOS class
      return await this.cptAndClaimCountsByDOS.get(req, res);
    } catch (error: unknown) {
      console.error(
        chalk.bgRed.white(
          'MedicareDashboardController; getCptAndClaimCountsByDOS; Error:',
        ),
        error,
      );
      const errorMessage =
        error instanceof Error ? error.message : 'MedicareDashboardController; getCptAndClaimCountsByDOS; Unknown error occurred';
      return res.status(500).json({
        message: 'Internal server error',
        error: errorMessage,
      });
    }
  };
  /** Chart 3 */
  public getChargesVsMedicareByDOS = async (req: Request, res: Response): Promise<Response> => {
    try {
      // Delegate the request to CptAndClaimCountsByDOS class
      return await this.chargesVsMedicareByDOS.get(req, res);
    } catch (error: unknown) {
      console.error(
        chalk.bgRed.white(
          'MedicareDashboardController; chargesVsMedicareByDOS; Error:',
        ),
        error,
      );
      const errorMessage =
        error instanceof Error ? error.message : 'MedicareDashboardController; chargesVsMedicareByDOS; Unknown error occurred';
      return res.status(500).json({
        message: 'Internal server error',
        error: errorMessage,
      });
    }
  };
  /** Chart 4 */
  public getPaymentsVsMedicareByDOS = async (req: Request, res: Response): Promise<Response> => {
    try {
      // Delegate the request to CptAndClaimCountsByDOS class
      return await this.paymentsVsMedicareByDOS.get(req, res);
    } catch (error: unknown) {
      console.error(
        chalk.bgRed.white(
          'MedicareDashboardController; getPaymentsVsMedicareByDOS; Error:',
        ),
        error,
      );
      const errorMessage =
        error instanceof Error ? error.message : 'MedicareDashboardController; getPaymentsVsMedicareByDOS; Unknown error occurred';
      return res.status(500).json({
        message: 'Internal server error',
        error: errorMessage,
      });
    }
  };
  /** Chart 4 */
  public getUncollectedMedicarePerClaim = async (req: Request, res: Response): Promise<Response> => {
    try {
      // Delegate the request to CptAndClaimCountsByDOS class
      return await this.uncollectedMedicarePerClaimByDOS.get(req, res);
    } catch (error: unknown) {
      console.error(
        chalk.bgRed.white(
          'MedicareDashboardController; getPaymentsVsMedicareByDOS; Error:',
        ),
        error,
      );
      const errorMessage =
        error instanceof Error ? error.message : 'MedicareDashboardController; getPaymentsVsMedicareByDOS; Unknown error occurred';
      return res.status(500).json({
        message: 'Internal server error',
        error: errorMessage,
      });
    }
  };
  // public getUncollectedMedicarePerClaim = async (  
  //   req: Request,
  //   res: Response,
  // ): Promise<Response> => {
    
  //   const { customer_id, filters } = req.body;
  
  //   let query: string;
  
  //   console.log(
  //     chalk.greenBright(
  //       `Medicare Dashboard; getPaymentsVsMedicareByDateOfService; Received parameters - customer_id: ${customer_id}`,
  //     ),
  //   );
  
  //   if (!customer_id) {
  //     console.warn(
  //       chalk.bgRed.white(
  //         `Medicare Dashboard; getPaymentsVsMedicareByDateOfService; Validation failed for parameters:`,
  //       ),
  //       { customer_id },
  //     );
  //     return res.status(400).json({
  //       message:
  //         'Medicare Dashboard; getPaymentsVsMedicareByDateOfService; Invalid or missing customer_id.',
  //     });
  //   }
  
  //   const filterConditions = buildFilterConditions(filters);
  //   console.log('MedicareDashboardController; filterConditions; ', filterConditions);
  
  //   const { start_date, end_date } = filters.payment_received || {};
  
  //   // Construct the dynamic date filter
  //   const dateFilter =
  //     start_date && end_date
  //       ? `p.date_of_service BETWEEN '${start_date}' AND '${end_date}'`
  //       : start_date
  //       ? `p.date_of_service >= '${start_date}'`
  //       : end_date
  //       ? `p.date_of_service <= '${end_date}'`
  //       : '1=1'; // No date filter applied if both are missing
  
  // }
  /** Chart 5 */
  public getUncollectedMCRPerClaimByDOS = async (req: Request, res: Response): Promise<Response> => {
    try {
      // Delegate the request to CptAndClaimCountsByDOS class
      return await this.uncollectedMCRPerClaimByDOS.get(req, res);
    } catch (error: unknown) {
      console.error(
        chalk.bgRed.white(
          'MedicareDashboardController; getUncollectedMCRPerClaimByDOS; Error:',
        ),
        error,
      );
      const errorMessage =
        error instanceof Error ? error.message : 'MedicareDashboardController; getUncollectedMCRPerClaimByDOS; Unknown error occurred';
      return res.status(500).json({
        message: 'Internal server error',
        error: errorMessage,
      });
    }
  };
  /** Chart 6 */
  public getUncollectedMedicarePerClaimMix = async (req: Request, res: Response): Promise<Response> => {
    try {
      // Delegate the request to CptAndClaimCountsByDOS class
      return await this.uncollectedMedicarePerClaimMixByDOS.get(req, res);
    } catch (error: unknown) {
      console.error(
        chalk.bgRed.white(
          'MedicareDashboardController; getPaymentsVsMedicareByDOS; Error:',
        ),
        error,
      );
      const errorMessage =
        error instanceof Error ? error.message : 'MedicareDashboardController; getPaymentsVsMedicareByDOS; Unknown error occurred';
      return res.status(500).json({
        message: 'Internal server error',
        error: errorMessage,
      });
    }
  };
 // Chart 7
  public getMedicareByCptGroup = async (req: Request, res: Response): Promise<Response> => {
    try {
      return await this.medicareByCptGroup.get(req, res);

    } catch (error: unknown) {
      console.error(
        chalk.bgRed.white(
          'MedicareDashboardController; getMedicareByCptGroup; Error:',
        ),
        error,
      );
      const errorMessage =
        error instanceof Error ? error.message : 'MedicareDashboardController; getMedicareByCptGroup; Unknown error occurred';
      return res.status(500).json({
        message: 'Internal server error',
        error: errorMessage,
      });
    }
  };
  /* Chart 8*/
  public getUncollectedMedicareByCptGroup = async (req: Request, res: Response): Promise<Response> => {
    try {
      return await this.uncollectedMedicareByCptGroup.get(req, res);

    } catch (error: unknown) {
      console.error(
        chalk.bgRed.white(
          'MedicareDashboardController; getUncollectedMedicareByCptGroup; Error:',
        ),
        error,
      );
      const errorMessage =
        error instanceof Error ? error.message : 'MedicareDashboardController; getUncollectedMedicareByCptGroup; Unknown error occurred';
      return res.status(500).json({
        message: 'Internal server error',
        error: errorMessage,
      });
    }
  }
}

export const medicareDashboardController = new MedicareDashboardController();

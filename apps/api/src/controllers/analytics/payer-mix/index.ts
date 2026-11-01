import { Request, Response } from 'express';
import chalk from 'chalk';
import { InsuranceCollections } from '../payer-mix/insurance-collections';
import { PatientCollections } from '../payer-mix/patient-collections';
import { CollectionTrends } from '../payer-mix/collection-trends';
import { ApiHandlerFactory } from '../../../controllers/api-handler-factory';
import { PayersIncreasingProduction } from './payers-increasing-production';
import { PayersDecreasingProduction } from './payers-decreasing-production';
import { ProceduresIncreasingProduction } from './procedures-increasing-production';
import { ProceduresDecreasingProduction } from './procedures-decreasing-production';
import { PayerCollectionDetails } from './payer-collection-details';
/**
 * PayerMix
 * 
 * Exposes HTTP endpoints for the Payer Mix dashboard, which tracks up-to-date
 * insurance and patient payment performance by payment date across practice
 * groups, locations, and providers.
 *
 * Architecture & Design:
 * - **Controller-Service Pattern**: Separates HTTP routing (this controller)
 *   from business logic (service classes: InsuranceCollections,
 *   PatientCollections, CollectionTrends).
 * 
 * - **Dependency Injection**: All metric services are instantiated in one place,
 *   making them easy to mock or swap for testing and future enhancements.
 * 
 * - **Factory Pattern**: Uses ApiHandlerFactory to generate uniform Express
 *   handlers that handle validation, error formatting, and response shaping-
 *   adhering to the Single Responsibility Principle.
 * 
 * - **Single Responsibility Principle**: Controller solely wires routes to
 *   handlers; service classes encapsulate data access and domain rules.
 * 
 * - **Extensibility & Maintainability**: To add a new payer-mix metric, simply
 *   implement a new service and register it in `services` and the constructor-
 *   no changes to core routing logic are required.
 * 
 * @param req 
 * @param res 
 * @returns 
 */
type ControllerMethod = (req: Request, res: Response) => Promise<Response>;

export class PayerMixController {
  private readonly services = {
    insurance: new InsuranceCollections(),
    patient: new PatientCollections(),
    trends: new CollectionTrends(),
    payersIncreasing: new PayersIncreasingProduction(),
    payersDecreasing: new PayersDecreasingProduction(),
    proceduresIncreasing: new ProceduresIncreasingProduction(),
    proceduresDecreasing: new ProceduresDecreasingProduction(),
    payerDetails: new PayerCollectionDetails(),
  };

  private readonly handlerFactory = new ApiHandlerFactory();
  
  public getInsuranceCollections: ControllerMethod;
  public getPatientCollections: ControllerMethod;
  public getCollectionTrends: ControllerMethod;
  public getPayersIncreasing!: ControllerMethod;
  public getPayersDecreasing!: ControllerMethod;
  public getProceduresIncreasing!: ControllerMethod;
  public getProceduresDecreasing!: ControllerMethod;
  public getPayerCollectionDetails!: ControllerMethod;

  constructor() {
    this.getInsuranceCollections = this.handlerFactory.create(this.services.insurance, 'getInsuranceCollections');
    this.getPatientCollections = this.handlerFactory.create(this.services.patient, 'getPatientCollections');
    this.getCollectionTrends = this.handlerFactory.create(this.services.trends, 'getCollectionTrends');
    this.getPayersIncreasing     = this.handlerFactory.create(this.services.payersIncreasing, 'getPayersIncreasing');
    this.getPayersDecreasing     = this.handlerFactory.create(this.services.payersDecreasing, 'getPayersDecreasing');
    this.getProceduresIncreasing = this.handlerFactory.create(this.services.proceduresIncreasing, 'getProceduresIncreasing');
    this.getProceduresDecreasing = this.handlerFactory.create(this.services.proceduresDecreasing, 'getProceduresDecreasing');
    this.getPayerCollectionDetails = this.handlerFactory.create(this.services.payerDetails, 'getPayerCollectionDetails');
  }
  };

export const payerMixController = new PayerMixController();

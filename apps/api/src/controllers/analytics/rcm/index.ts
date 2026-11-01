import { Request, Response } from 'express';
import { ClaimsCount } from './claims-count';
import { CollectionRate } from './collection-rate';
import { RevenueByLocation } from './revenue-by-location';
import { GrossProduction } from './gross-production';

import { ClaimValueByStatus } from './claim-value-by-status';
import { ClaimAmountsByPractice } from './claim-amounts-by-practice';
import { CollectionAdjustmentTrends } from './collection-adjustment-trends';
import { ClaimAmountsByPayer } from './claim-amounts-by-payer';
import { ClaimValuesByType } from './claim-values-by-type';
import { ClaimsCountByLocationGroup } from './claims-count-by-location-group';

import { ApiHandlerFactory } from '../../../controllers/api-handler-factory';

type ControllerMethod = (req: Request, res: Response) => Promise<Response>;

export class RCMController {
  private readonly services = {
    claimsCount: new ClaimsCount(),
    collectionRate: new CollectionRate(),
    grossProduction: new GrossProduction(),
    revenueByLocation: new RevenueByLocation(),

    claimValueByStatus: new ClaimValueByStatus(),
    claimAmountsByPractice: new ClaimAmountsByPractice(),
    collectionAdjustmentTrends: new CollectionAdjustmentTrends(),
    claimAmountsByPayer: new ClaimAmountsByPayer(),
    claimValuesByType: new ClaimValuesByType(),
    claimsCountByLocationGroup: new ClaimsCountByLocationGroup(),
  };

  private readonly handlerFactory = new ApiHandlerFactory();

  public getClaimsCount: ControllerMethod;
  public getCollectionRate: ControllerMethod;
  public getGrossProduction: ControllerMethod;
  public getRevenueByLocation: ControllerMethod;

  public getClaimValueByStatus: ControllerMethod;
  public getClaimAmountsByPractice: ControllerMethod;
  public getCollectionAdjustmentTrends: ControllerMethod;
  public getClaimAmountsByPayer: ControllerMethod;
  public getClaimValuesByType: ControllerMethod;
  public getClaimsCountByLocationGroup: ControllerMethod;

  constructor() {
    this.getClaimsCount       = this.handlerFactory.create(this.services.claimsCount, 'get');
    this.getCollectionRate    = this.handlerFactory.create(this.services.collectionRate, 'get');
    this.getGrossProduction   = this.handlerFactory.create(this.services.grossProduction, 'get');
    this.getRevenueByLocation = this.handlerFactory.create(this.services.revenueByLocation, 'get');

    this.getClaimValueByStatus         = this.handlerFactory.create(this.services.claimValueByStatus, 'get');
    this.getClaimAmountsByPractice     = this.handlerFactory.create(this.services.claimAmountsByPractice, 'get');
    this.getCollectionAdjustmentTrends = this.handlerFactory.create(this.services.collectionAdjustmentTrends, 'get');
    this.getClaimAmountsByPayer        = this.handlerFactory.create(this.services.claimAmountsByPayer, 'get');
    this.getClaimValuesByType          = this.handlerFactory.create(this.services.claimValuesByType, 'get');
    this.getClaimsCountByLocationGroup = this.handlerFactory.create(this.services.claimsCountByLocationGroup, 'get');
  }
}

export const rcmController = new RCMController();

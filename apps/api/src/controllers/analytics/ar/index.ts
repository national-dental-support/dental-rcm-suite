import { Request, Response } from 'express';
import { ARBalanceByDOS } from './ar-balance';
import {ARDaysByDOS } from './ar-days';
import { ARSummary } from './ar-summary'
import { ARCollectionsBreakdown } from './ar-collections-breakdown';
import { ApiHandlerFactory } from '../../api-handler-factory';
import { ARDistributionAcrossOpenBalances } from './ar-distribution';
import { ARDaysByPractice } from './ar-days-by-practice';
/**
 * AR Balance
 * 
 * Determined by what's left after patient and insurance collection payments against the total submitted
 * amount for procedures (CPTs) in a claim

 * - Orchestrates HTTP endpoints for Accounts Receivable (AR) analytics:
 * - AR Balance by Date of Service: remaining balance after patient & insurance payments
 * - AR Days by Date of Service: days outstanding for receivables
 * - AR Summary: aggregate overview of AR metrics
 * - AR Collections Breakdown: detailed breakdown of collections by category
 *
 * Architecture & Design:
 * - **Controller-Service Pattern**: Clean separation of HTTP routing (controller) from domain logic (service classes).
 * - **Dependency Injection**: All AR metric services are instantiated in one place, simplifying testing and future swaps.
 * - **Factory Pattern**: Uses `ApiHandlerFactory` to generate consistent Express handlers that handle validation, error handling, and response shaping-adhering to SRP.
 * - **Single Responsibility Principle**: Controller only wires routes to handlers; each service encapsulates its own data access and business rules.
 * - **Extensibility & Maintainability**: To add a new AR metric, implement a new service class and register it in `services` and the constructor-no changes to existing routing logic.
 * 
 * @param req 
 * @param res 
 * @returns 
 */
type ControllerMethod = (req: Request, res: Response) => Promise<Response>;

export class ARController {
  private readonly services = {
    arBalance: new ARBalanceByDOS(),
    arDays: new ARDaysByDOS(),
    arSummary: new ARSummary(),
    arCollectionsBreakdown: new ARCollectionsBreakdown(),
    arDistribution: new ARDistributionAcrossOpenBalances(),
    arDaysByPractice: new ARDaysByPractice(),
  };
  
  private readonly handlerFactory = new ApiHandlerFactory();

  constructor() {
    this.getARBalance = this.handlerFactory.create(this.services.arBalance, 'getARBalance');
    this.getARDays = this.handlerFactory.create(this.services.arDays, 'getARDays');
    this.getARDaysByPractice = this.handlerFactory.create(this.services.arDaysByPractice, 'getARDaysByPractice');
    this.getARSummary = this.handlerFactory.create(this.services.arSummary, 'getARSummary');
    this.getARCollectionsBreakdown = this.handlerFactory.create(this.services.arCollectionsBreakdown, 'getARCollectionsBreakdown');
    this.getARDistribution = this.handlerFactory.create(
      this.services.arDistribution,
      'getARDistribution'
    ); // <- NEW
  };

  public getARBalance: ControllerMethod;
  public getARDays: ControllerMethod;
  public getARSummary: ControllerMethod;
  public getARCollectionsBreakdown: ControllerMethod;
  public getARDistribution: ControllerMethod;
  public getARDaysByPractice: ControllerMethod;
};

export const arController = new ARController();
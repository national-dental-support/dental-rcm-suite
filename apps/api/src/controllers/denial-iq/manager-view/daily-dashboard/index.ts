import { Request, Response } from 'express';
import { YesterdaySummary } from './yesterday-summary';
import { ARMix } from './ar-mix';
import { PaymentBreakdownPie } from './payment-breakdown-pie';
import { RevenueTrends } from './revenue-trends';
import { ARByLocation } from './ar-by-location';
import { StaffPerformance } from './staff-performance';
import { TrainingMatrix } from './training-matrix';

type ControllerMethod = (req: Request, res: Response) => Promise<Response>;

export class DailyDashboardController {
  private readonly services = {
    yesterdaySummary: new YesterdaySummary(),
    arMix: new ARMix(),
    paymentBreakdownPie: new PaymentBreakdownPie(),
    revenueTrends: new RevenueTrends(),
    arByLocation: new ARByLocation(),
    staffPerformance: new StaffPerformance(),
    trainingMatrix: new TrainingMatrix(),
  };

  getYesterdaySummary: ControllerMethod;
  getARMix: ControllerMethod;
  getPaymentBreakdownPie: ControllerMethod;
  getRevenueTrends: ControllerMethod;
  getARByLocation: ControllerMethod;
  getStaffPerformance: ControllerMethod;
  getTrainingMatrix: ControllerMethod;

  constructor() {
    this.getYesterdaySummary =
      this.services.yesterdaySummary.get.bind(this.services.yesterdaySummary);
    this.getARMix =
      this.services.arMix.get.bind(this.services.arMix);
    this.getPaymentBreakdownPie =
      this.services.paymentBreakdownPie.get.bind(this.services.paymentBreakdownPie);
    this.getRevenueTrends =
      this.services.revenueTrends.get.bind(this.services.revenueTrends);
    this.getARByLocation =
      this.services.arByLocation.get.bind(this.services.arByLocation);
    this.getStaffPerformance =
      this.services.staffPerformance.get.bind(this.services.staffPerformance);
    this.getTrainingMatrix =
      this.services.trainingMatrix.get.bind(this.services.trainingMatrix);
  }
}

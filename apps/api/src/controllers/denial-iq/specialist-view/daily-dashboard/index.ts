import { Request, Response } from 'express';
import { TodaySummary } from './today-summary';
import { MyPerformanceSummary } from './my-performance-summary';
import { AnalystProficiency } from './analyst-proficiency';
import { PerformanceTrends } from './performance-trends';
import { ResolutionMetrics } from './resolution-metrics';
import { PeerRanking } from './peer-ranking';

type ControllerMethod = (req: Request, res: Response) => Promise<Response>;

export class SpecialistDailyDashboardController {
  private readonly services = {
    todaySummary: new TodaySummary(),
    myPerformanceSummary: new MyPerformanceSummary(),
    analystProficiency: new AnalystProficiency(),
    performanceTrends: new PerformanceTrends(),
    resolutionMetrics: new ResolutionMetrics(),
    peerRanking: new PeerRanking(),
  };

  getTodaySummary: ControllerMethod = this.services.todaySummary.get.bind(this.services.todaySummary);
  getMyPerformanceSummary: ControllerMethod = this.services.myPerformanceSummary.get.bind(this.services.myPerformanceSummary);
  getAnalystProficiency: ControllerMethod = this.services.analystProficiency.get.bind(this.services.analystProficiency);
  getPerformanceTrends: ControllerMethod = this.services.performanceTrends.get.bind(this.services.performanceTrends);
  getResolutionMetrics: ControllerMethod = this.services.resolutionMetrics.get.bind(this.services.resolutionMetrics);
  getPeerRanking: ControllerMethod = this.services.peerRanking.get.bind(this.services.peerRanking);
}

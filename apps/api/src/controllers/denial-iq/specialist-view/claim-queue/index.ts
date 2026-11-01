import { Request, Response } from 'express';
import { MyQueue } from './my-queue';
import { AllClaims } from './all-claims';
import { Escalations } from './escalations';
import { Unassigned } from './unassigned';
import { PendingQueue } from './pending';
import { AwaitingAdjudication } from './awaiting-adjudication';
import { NotSubmitted } from './not-submitted';
import { ClaimQueueExport } from './export';

type ControllerMethod = (req: Request, res: Response) => Promise<Response>;

export class SpecialistClaimQueueController {
  private readonly services = {
    myQueue: new MyQueue(),
    allClaims: new AllClaims(),
    escalations: new Escalations(),
    unassigned: new Unassigned(),
    pending: new PendingQueue(),
    awaitingAdjudication: new AwaitingAdjudication(),
    notSubmitted: new NotSubmitted(),
    export: new ClaimQueueExport(),
  };

  getMyQueue: ControllerMethod = this.services.myQueue.get.bind(this.services.myQueue);
  getAllClaims: ControllerMethod = this.services.allClaims.get.bind(this.services.allClaims);
  getEscalations: ControllerMethod = this.services.escalations.get.bind(this.services.escalations);
  getUnassigned: ControllerMethod = this.services.unassigned.get.bind(this.services.unassigned);
  getPending: ControllerMethod = this.services.pending.get.bind(this.services.pending);
  getAwaitingAdjudication: ControllerMethod = this.services.awaitingAdjudication.get.bind(this.services.awaitingAdjudication);
  getNotSubmitted: ControllerMethod = this.services.notSubmitted.get.bind(this.services.notSubmitted);
  exportQueue: ControllerMethod = this.services.export.get.bind(this.services.export);
}

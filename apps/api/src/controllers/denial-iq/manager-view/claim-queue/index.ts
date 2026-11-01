import { Request, Response } from 'express';
import { Escalations } from './escalations';
import { Unassigned } from './unassigned';
import { AllClaims } from './all-claims';

type ControllerMethod = (req: Request, res: Response) => Promise<Response>;

export class ClaimQueueController {
  private readonly services = {
    escalations: new Escalations(),
    unassigned: new Unassigned(),
    allClaims: new AllClaims(),
  };

  getEscalations: ControllerMethod = this.services.escalations.get.bind(this.services.escalations);
  getUnassigned: ControllerMethod = this.services.unassigned.get.bind(this.services.unassigned);
  getAllClaims: ControllerMethod = this.services.allClaims.get.bind(this.services.allClaims);
}

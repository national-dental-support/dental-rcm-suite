import { Request, Response } from 'express';
import { ClaimInformation } from './claim-information';
import { ClaimDetailTable } from './claim-detail-table';

type ControllerMethod = (req: Request, res: Response) => Promise<Response>;

export class ClaimDetailController {
  private readonly services = {
    claimInformation: new ClaimInformation(),
    claimDetailTable: new ClaimDetailTable(),
  };

  getClaimInformation: ControllerMethod = this.services.claimInformation.get.bind(this.services.claimInformation);
  getClaimDetailTable: ControllerMethod = this.services.claimDetailTable.get.bind(this.services.claimDetailTable);
}

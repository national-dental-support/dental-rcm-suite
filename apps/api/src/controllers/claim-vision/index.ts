import { Request, Response } from 'express';
import { ClaimVision } from './rejected-claims';
import { ClaimVisionDetail } from './rejected-claims-detail';
import { CustomRules } from './custom-rules';
import { SystemRules } from './system-rules';
import { CreateRule } from './create-rule';
import { UpdateRule } from './update-rule';
import { UpdateRejectedClaimStatus } from './update-rejected-claim-status';
import { DeleteRule } from './delete-rule';
import { ReorderRules } from './reorder-rules';

type ControllerMethod = (req: Request, res: Response) => Promise<Response>;

export class ClaimVisionController {
  private readonly services = {
    rejectedClaims: new ClaimVision(),
    rejectedClaimsDetail: new ClaimVisionDetail(),
    customRules: new CustomRules(),
    systemRules: new SystemRules(),
    createRule: new CreateRule(),
    updateRule: new UpdateRule(),
    deleteRule: new DeleteRule(),
    reorderRules: new ReorderRules(),
    updateRejectedClaimStatus: new UpdateRejectedClaimStatus(),
  };

  getRejectedClaims: ControllerMethod = this.services.rejectedClaims.get.bind(this.services.rejectedClaims);
  getRejectedClaimsTrend: ControllerMethod = this.services.rejectedClaims.getTrend.bind(this.services.rejectedClaims);
  getRejectedClaimsDetail: ControllerMethod = this.services.rejectedClaimsDetail.get.bind(this.services.rejectedClaimsDetail);
  getCustomRules: ControllerMethod = this.services.customRules.get.bind(this.services.customRules);
  getSystemRules: ControllerMethod = this.services.systemRules.get.bind(this.services.systemRules);
  createRule: ControllerMethod = this.services.createRule.post.bind(this.services.createRule);
  updateRule: ControllerMethod = this.services.updateRule.put.bind(this.services.updateRule);
  deleteRule: ControllerMethod = this.services.deleteRule.delete.bind(this.services.deleteRule);
  reorderRules: ControllerMethod = this.services.reorderRules.patch.bind(this.services.reorderRules);
  updateRejectedClaimStatus: ControllerMethod = this.services.updateRejectedClaimStatus.patch.bind(this.services.updateRejectedClaimStatus);
}

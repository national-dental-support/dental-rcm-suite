import { Request, Response } from 'express';
import { ChargeAmount } from './dashboard/charge-amount';
import { PayerMixReimbursementPayment } from './dashboard/payer-mix-reimbursement-payments';
import { PayerMixPatientVolume } from './dashboard/payer-mix-patient-volume';
import { PayerMixCptVolume } from './dashboard/payer-mix-cpt-volume';
import { ForecastingPayerPayments } from './dashboard/forecasting-payer-payments';
import { NetworkPayersDropdown } from './network-payers/network-payers-dropdown';
import { CPTNonPayment } from './dashboard/CPT-non-payment';
import { PayerDetails } from './dashboard/payer-details';
import { NetworkLeases } from './network-leases/network-leases';
import { AtRiskPayers } from './underpayments/at-risk-payers';
import { BuilderInfo } from './strategy/builder-info';
import { ContractOptions } from './strategy/contract-options';
import { OptimizeProposed } from './strategy/optimize-proposed';

type ControllerMethod = (req: Request, res: Response) => Promise<Response>;

export class PayerIQController {
  private readonly services = {
    chargeAmount: new ChargeAmount(),
    payerMixReimbursementPayment: new PayerMixReimbursementPayment(),
    payerMixPatientVolume: new PayerMixPatientVolume(),
    payerMixCptVolume: new PayerMixCptVolume(),
    forecastingPayerPayments: new ForecastingPayerPayments(),
    networkPayersDropdown: new NetworkPayersDropdown(),
    cptNonPayment: new CPTNonPayment(),
    payerDetails: new PayerDetails(),
    networkLeases: new NetworkLeases(),
    atRiskPayers: new AtRiskPayers(),
    builderInfo: new BuilderInfo(),
    contractOptions: new ContractOptions(),
    optimizeProposed: new OptimizeProposed(),
  };

  getChargeAmount: ControllerMethod = this.services.chargeAmount.get.bind(this.services.chargeAmount);
  getPayerMixReimbursementPayment: ControllerMethod = this.services.payerMixReimbursementPayment.get.bind(this.services.payerMixReimbursementPayment);
  getPayerMixPatientVolume: ControllerMethod = this.services.payerMixPatientVolume.get.bind(this.services.payerMixPatientVolume);
  getPayerMixCptVolume: ControllerMethod = this.services.payerMixCptVolume.get.bind(this.services.payerMixCptVolume);
  getForecastingPayerPayments: ControllerMethod = this.services.forecastingPayerPayments.get.bind(this.services.forecastingPayerPayments);
  getNetworkPayersDropdown: ControllerMethod = this.services.networkPayersDropdown.get.bind(this.services.networkPayersDropdown);
  getCptNonPayment: ControllerMethod = this.services.cptNonPayment.get.bind(this.services.cptNonPayment);
  getPayerDetails: ControllerMethod = this.services.payerDetails.get.bind(this.services.payerDetails);
  getNetworkLeases: ControllerMethod = this.services.networkLeases.get.bind(this.services.networkLeases);
  getAtRiskPayers: ControllerMethod = this.services.atRiskPayers.get.bind(this.services.atRiskPayers);
  getBuilderInfo: ControllerMethod = this.services.builderInfo.get.bind(this.services.builderInfo);
  getContractOptions: ControllerMethod = this.services.contractOptions.get.bind(this.services.contractOptions);
  postOptimizeProposed: ControllerMethod = this.services.optimizeProposed.post.bind(this.services.optimizeProposed);
}
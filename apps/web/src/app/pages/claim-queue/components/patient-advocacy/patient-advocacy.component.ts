import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
} from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../../environments/environment';

const BASE = `${environment.server.baseUrl}/denial-iq/patient-advocacy`;

export interface AdvocacySummary {
  claimId: string;
  patientName: string;
  denialReason: string;
  denialCode: string;
  denialDate: string;
  plainEnglishExplanation: string;
  nextSteps: string[];
}

const MOCK_SCENARIOS: AdvocacySummary[] = [
  {
    claimId: 'CL50001',
    patientName: 'Jane Smith',
    denialReason: 'Prior Authorization Required',
    denialCode: 'CO-15',
    denialDate: '2026-04-15',
    plainEnglishExplanation:
      'Your claim was denied because the requested service requires prior approval from your insurance company before treatment begins. This is called "prior authorization." Your insurance company reviews the request to confirm the service is medically necessary according to their policies. Without this pre-approval, they are not obligated to pay for the service.',
    nextSteps: [
      "Contact your doctor's office to confirm they submitted a prior authorization request.",
      'Call your insurance company (the number on the back of your insurance card) to ask about the status of any prior auth requests.',
      "If a prior auth was never submitted, ask your doctor to submit one now \u2014 many plans allow retroactive authorization within 30 days.",
      'If authorization was denied, you have the right to appeal. Ask your insurance company for the denial reason in writing.',
      'Request an expedited appeal if the service is urgent.',
    ],
  },
  {
    claimId: 'CL50002',
    patientName: 'Robert Johnson',
    denialReason: 'Timely Filing Limit Exceeded',
    denialCode: 'CO-29',
    denialDate: '2026-03-22',
    plainEnglishExplanation:
      'Your claim was denied because it was submitted to your insurance company after their deadline. Insurance companies require that claims be submitted within a certain time period after the date of service (usually 90 to 365 days, depending on your plan). Your provider submitted this claim after that window had closed.',
    nextSteps: [
      "Ask your provider for the original claim submission date and any proof of timely filing (clearinghouse receipt, payer acknowledgement).",
      'If your provider can show proof that the claim was submitted on time, submit a timely filing appeal with that documentation.',
      'Check if your plan has exceptions (e.g., claims delayed due to coordination of benefits or system errors).',
      'File a formal appeal with your insurance company within 60 days of receiving the denial notice.',
      'If your appeal is denied, contact your state insurance commissioner for assistance.',
    ],
  },
  {
    claimId: 'CL50003',
    patientName: 'Maria Garcia',
    denialReason: 'Medical Necessity Not Established',
    denialCode: 'CO-50',
    denialDate: '2026-05-01',
    plainEnglishExplanation:
      'Your claim was denied because your insurance company determined that the service was not "medically necessary" based on the information they received. Medical necessity means that the treatment is appropriate, reasonable, and required to diagnose or treat your condition according to accepted clinical standards. This does not necessarily mean the service was wrong \u2014 it means your insurer needs more documentation to justify coverage.',
    nextSteps: [
      "Ask your doctor to write a letter of medical necessity explaining why this specific treatment was required for your condition.",
      'Gather supporting clinical documentation: lab results, imaging reports, prior treatment history.',
      'File an appeal with your insurance company and include all supporting documentation from your doctor.',
      "Ask your doctor if a peer-to-peer review is available \u2014 this lets your doctor speak directly with the insurance company's medical reviewer.",
      'If the appeal is denied, request an Independent Medical Review (IMR) through your state insurance department.',
    ],
  },
  {
    claimId: 'CL50004',
    patientName: 'David Chen',
    denialReason: 'Duplicate Claim Submission',
    denialCode: 'CO-18',
    denialDate: '2026-04-28',
    plainEnglishExplanation:
      "Your claim was denied because your insurance company identified it as a duplicate \u2014 meaning a claim for the same service on the same date was already submitted and processed. This can happen if a claim was accidentally submitted twice, or if there was a billing system error. If the original claim was paid correctly, no further action may be needed.",
    nextSteps: [
      "Contact your provider's billing department to verify if the original claim was paid and posted correctly.",
      'Request an Explanation of Benefits (EOB) from your insurance company for the original claim to confirm payment.',
      "If the original claim was NOT paid and this denial is in error, ask your provider to submit a corrected claim with a different frequency code.",
      'If you believe only one claim was submitted, ask your insurance company for the claim reference number of the alleged duplicate.',
      'File an appeal if you can demonstrate that the two claims represent distinct services or dates of service.',
    ],
  },
];

@Component({
  selector: 'app-patient-advocacy',
  templateUrl: './patient-advocacy.component.html',
  styleUrls: ['./patient-advocacy.component.scss'],
  standalone: false,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PatientAdvocacyComponent {
  searchQuery = '';
  selectedClaimId = '';
  scenarios = MOCK_SCENARIOS;

  currentSummary: AdvocacySummary | null = null;
  generatedLetter = '';
  showLetter = false;
  letterCopied = false;
  loading = false;
  letterLoading = false;

  constructor(
    private http: HttpClient,
    private cdr: ChangeDetectorRef,
  ) {}

  get availableClaimIds(): string[] {
    return this.scenarios.map(s => s.claimId);
  }

  lookupClaim(): void {
    const query = this.searchQuery.trim() || this.selectedClaimId;
    if (!query) return;

    // First check mock data
    const found = this.scenarios.find(
      s =>
        s.claimId.toLowerCase() === query.toLowerCase() ||
        s.patientName.toLowerCase().includes(query.toLowerCase()),
    );

    if (found) {
      this.currentSummary = found;
      this.showLetter = false;
      this.generatedLetter = '';
      this.cdr.markForCheck();
      return;
    }

    // Try API
    this.loading = true;
    this.http
      .get<AdvocacySummary>(
        `${BASE}/claims/${encodeURIComponent(query)}/advocacy-summary`,
      )
      .subscribe({
        next: summary => {
          this.currentSummary = summary;
          this.showLetter = false;
          this.generatedLetter = '';
          this.loading = false;
          this.cdr.markForCheck();
        },
        error: () => {
          this.currentSummary = null;
          this.loading = false;
          this.cdr.markForCheck();
        },
      });
  }

  selectScenario(claimId: string): void {
    this.selectedClaimId = claimId;
    this.searchQuery = claimId;
    this.lookupClaim();
  }

  generateLetter(): void {
    if (!this.currentSummary) return;
    this.letterLoading = true;

    this.http
      .post<{ claimId: string; letter: string }>(
        `${BASE}/claims/${this.currentSummary.claimId}/generate-letter`,
        {},
      )
      .subscribe({
        next: resp => {
          this.generatedLetter = resp.letter;
          this.showLetter = true;
          this.letterLoading = false;
          this.cdr.markForCheck();
        },
        error: () => {
          // Fallback mock letter
          const s = this.currentSummary!;
          const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
          this.generatedLetter = `${today}\n\nTo Whom It May Concern,\nInsurance Appeals Department\n\nRE: Appeal for Claim ${s.claimId} \u2014 ${s.patientName}\nDenial Code: ${s.denialCode} \u2014 ${s.denialReason}\nDate of Denial: ${s.denialDate}\n\nDear Appeals Review Team,\n\nI am writing to formally appeal the denial of the above-referenced claim for patient ${s.patientName}. I received notice that my claim was denied on ${s.denialDate} with the reason cited as "${s.denialReason}" (Denial Code: ${s.denialCode}).\n\nI respectfully disagree with this determination and am requesting a full reconsideration based on the information enclosed.\n\nSincerely,\n\n${s.patientName}\n\nEnclosures:\n- Explanation of Benefits (EOB)\n- Supporting Medical Records\n- Physician Statement of Medical Necessity (if applicable)\n`;
          this.showLetter = true;
          this.letterLoading = false;
          this.cdr.markForCheck();
        },
      });
  }

  copyLetter(): void {
    if (!this.generatedLetter) return;
    navigator.clipboard.writeText(this.generatedLetter).then(() => {
      this.letterCopied = true;
      this.cdr.markForCheck();
      setTimeout(() => {
        this.letterCopied = false;
        this.cdr.markForCheck();
      }, 2500);
    });
  }

  reset(): void {
    this.currentSummary = null;
    this.generatedLetter = '';
    this.showLetter = false;
    this.searchQuery = '';
    this.selectedClaimId = '';
    this.cdr.markForCheck();
  }
}

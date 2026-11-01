import express from 'express';

const router = express.Router();

/** --- Mock advocacy scenarios --- */
const ADVOCACY_SCENARIOS: Record<string, {
  claimId: string;
  patientName: string;
  denialReason: string;
  denialCode: string;
  denialDate: string;
  plainEnglishExplanation: string;
  nextSteps: string[];
}> = {
  'CL50001': {
    claimId: 'CL50001',
    patientName: 'Jane Smith',
    denialReason: 'Prior Authorization Required',
    denialCode: 'CO-15',
    denialDate: '2026-04-15',
    plainEnglishExplanation:
      "Your claim was denied because the requested service requires prior approval from your insurance company before treatment begins. This is called \"prior authorization.\" Your insurance company reviews the request to confirm the service is medically necessary according to their policies. Without this pre-approval, they are not obligated to pay for the service.",
    nextSteps: [
      'Contact your doctor\'s office to confirm they submitted a prior authorization request.',
      'Call your insurance company (the number on the back of your insurance card) to ask about the status of any prior auth requests.',
      'If a prior auth was never submitted, ask your doctor to submit one now \u2014 many plans allow retroactive authorization within 30 days.',
      'If authorization was denied, you have the right to appeal. Ask your insurance company for the denial reason in writing.',
      'Request an expedited appeal if the service is urgent.',
    ],
  },
  'CL50002': {
    claimId: 'CL50002',
    patientName: 'Robert Johnson',
    denialReason: 'Timely Filing Limit Exceeded',
    denialCode: 'CO-29',
    denialDate: '2026-03-22',
    plainEnglishExplanation:
      "Your claim was denied because it was submitted to your insurance company after their deadline. Insurance companies require that claims be submitted within a certain time period after the date of service (usually 90 to 365 days, depending on your plan). Your provider submitted this claim after that window had closed.",
    nextSteps: [
      'Ask your provider for the original claim submission date and any proof of timely filing (clearinghouse receipt, payer acknowledgement).',
      'If your provider can show proof that the claim was submitted on time, submit a timely filing appeal with that documentation.',
      'Check if your plan has exceptions (e.g., claims delayed due to coordination of benefits or system errors).',
      'File a formal appeal with your insurance company within 60 days of receiving the denial notice.',
      'If your appeal is denied, contact your state insurance commissioner for assistance.',
    ],
  },
  'CL50003': {
    claimId: 'CL50003',
    patientName: 'Maria Garcia',
    denialReason: 'Medical Necessity Not Established',
    denialCode: 'CO-50',
    denialDate: '2026-05-01',
    plainEnglishExplanation:
      "Your claim was denied because your insurance company determined that the service was not \"medically necessary\" based on the information they received. Medical necessity means that the treatment is appropriate, reasonable, and required to diagnose or treat your condition according to accepted clinical standards. This does not necessarily mean the service was wrong \u2014 it means your insurer needs more documentation to justify coverage.",
    nextSteps: [
      'Ask your doctor to write a letter of medical necessity explaining why this specific treatment was required for your condition.',
      'Gather supporting clinical documentation: lab results, imaging reports, prior treatment history.',
      'File an appeal with your insurance company and include all supporting documentation from your doctor.',
      'Ask your doctor if a peer-to-peer review is available \u2014 this lets your doctor speak directly with the insurance company\'s medical reviewer.',
      'If the appeal is denied, request an Independent Medical Review (IMR) through your state insurance department.',
    ],
  },
  'CL50004': {
    claimId: 'CL50004',
    patientName: 'David Chen',
    denialReason: 'Duplicate Claim Submission',
    denialCode: 'CO-18',
    denialDate: '2026-04-28',
    plainEnglishExplanation:
      "Your claim was denied because your insurance company identified it as a duplicate \u2014 meaning a claim for the same service on the same date was already submitted and processed. This can happen if a claim was accidentally submitted twice, or if there was a billing system error. If the original claim was paid correctly, no further action may be needed.",
    nextSteps: [
      'Contact your provider\'s billing department to verify if the original claim was paid and posted correctly.',
      'Request an Explanation of Benefits (EOB) from your insurance company for the original claim to confirm payment.',
      'If the original claim was NOT paid and this denial is in error, ask your provider to submit a corrected claim with a different frequency code.',
      'If you believe only one claim was submitted, ask your insurance company for the claim reference number of the alleged duplicate.',
      'File an appeal if you can demonstrate that the two claims represent distinct services or dates of service.',
    ],
  },
};

const LETTER_TEMPLATES = [
  {
    id: 'prior-auth-appeal',
    name: 'Prior Authorization Appeal Letter',
    applicableDenialCodes: ['CO-15', 'CO-16'],
    description: 'Use when a claim was denied for lack of prior authorization.',
  },
  {
    id: 'timely-filing-appeal',
    name: 'Timely Filing Appeal Letter',
    applicableDenialCodes: ['CO-29'],
    description: 'Use when appealing a denial based on late submission.',
  },
  {
    id: 'medical-necessity-appeal',
    name: 'Medical Necessity Appeal Letter',
    applicableDenialCodes: ['CO-50', 'CO-51'],
    description: 'Use when disputing a medical necessity denial.',
  },
  {
    id: 'duplicate-claim-correction',
    name: 'Duplicate Claim Correction Letter',
    applicableDenialCodes: ['CO-18'],
    description: 'Use when a claim was incorrectly identified as a duplicate.',
  },
  {
    id: 'general-appeal',
    name: 'General Appeal Letter',
    applicableDenialCodes: [],
    description: 'A general-purpose appeal letter for any denial type.',
  },
];

function generateLetter(claimId: string, patientName: string, denialReason: string, denialCode: string, denialDate: string, nextSteps: string[]): string {
  const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const stepsText = nextSteps.slice(0, 3).map((s, i) => `${i + 1}. ${s}`).join('\n');
  return `${today}

To Whom It May Concern,
Insurance Appeals Department

RE: Appeal for Claim ${claimId} \u2014 ${patientName}
Denial Code: ${denialCode} \u2014 ${denialReason}
Date of Denial: ${denialDate}

Dear Appeals Review Team,

I am writing to formally appeal the denial of the above-referenced claim for patient ${patientName}. I received notice that my claim was denied on ${denialDate} with the reason cited as "${denialReason}" (Denial Code: ${denialCode}).

I respectfully disagree with this determination and am requesting a full reconsideration. I believe this claim should be paid in full based on the following reasons:

${stepsText}

I am enclosing all relevant supporting documentation, including medical records, physician notes, and any prior correspondence regarding this claim. I request that you review this information carefully and issue a written decision within the timeframe required by applicable state and federal regulations.

If you require additional information, please contact me at the address or phone number listed below. I look forward to your timely response.

Sincerely,

${patientName}

Enclosures:
- Explanation of Benefits (EOB)
- Supporting Medical Records
- Physician Statement of Medical Necessity (if applicable)
`;
}

/** GET /claims/:claimId/advocacy-summary - patient-friendly denial explanation */
router.get('/claims/:claimId/advocacy-summary', (req, res) => {
  const { claimId } = req.params;
  const scenario = ADVOCACY_SCENARIOS[claimId];
  if (!scenario) {
    // Return a generic response for unknown claim IDs
    return res.json({
      claimId,
      patientName: 'Patient',
      denialReason: 'Not Covered / Benefit Exhausted',
      denialCode: 'CO-96',
      denialDate: new Date().toISOString().split('T')[0],
      plainEnglishExplanation:
        'Your claim was denied because the service is not covered under your current insurance plan, or your benefits for this service type have been exhausted for the current plan year. Please review your insurance Summary of Benefits for coverage details.',
      nextSteps: [
        'Review your insurance plan\'s Summary of Benefits to understand your coverage limits.',
        'Contact your insurance company to ask for a detailed explanation of why this service is not covered.',
        'Ask your doctor if an alternative treatment or service is covered by your plan.',
        'If you believe the denial is in error, file a formal appeal within 60 days of the denial notice.',
      ],
    });
  }
  res.json(scenario);
});

/** GET /templates - list patient letter templates */
router.get('/templates', (_req, res) => {
  res.json({ templates: LETTER_TEMPLATES });
});

/** POST /claims/:claimId/generate-letter - generate advocacy letter */
router.post('/claims/:claimId/generate-letter', (req, res) => {
  const { claimId } = req.params;
  const scenario = ADVOCACY_SCENARIOS[claimId];

  if (!scenario) {
    const letter = generateLetter(
      claimId,
      'Patient',
      'Not Covered / Benefit Exhausted',
      'CO-96',
      new Date().toISOString().split('T')[0],
      ['Review your plan coverage details.', 'Contact your insurance company for more information.'],
    );
    return res.json({ claimId, letter });
  }

  const letter = generateLetter(
    scenario.claimId,
    scenario.patientName,
    scenario.denialReason,
    scenario.denialCode,
    scenario.denialDate,
    scenario.nextSteps,
  );
  res.json({ claimId, letter });
});

export default router;

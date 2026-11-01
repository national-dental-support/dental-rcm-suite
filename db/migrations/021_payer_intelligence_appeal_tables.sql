-- @data: reference
-- ============================================================
-- 021_payer_intelligence_appeal_tables.sql
--
-- Creates tables needed by Phase 2B (Payer Intelligence) and
-- Phase 3 (Appeal Letter Generator):
--   1. Carcs               - CARC code dictionary
--   2. CarcPayerGuidance   - per-code actionable guidance
--   3. PayerFilingDeadlines - timely filing & appeal windows
--   4. AppealLetterTemplate - letter templates
--
-- ClaimAppeal already exists (created earlier).
-- ============================================================

-- -- 1. CARC code dictionary ------------------------------------------------
IF OBJECT_ID('dbo.Carcs', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.Carcs (
    id          INT IDENTITY(1,1) PRIMARY KEY,
    code        NVARCHAR(20)   NOT NULL UNIQUE,
    description NVARCHAR(500)  NOT NULL,
    category    NVARCHAR(100)  NULL
  );
END;

-- Seed top CARC codes used in claims data
IF NOT EXISTS (SELECT 1 FROM dbo.Carcs WHERE code = 'CO4')
BEGIN
  INSERT INTO dbo.Carcs (code, description, category) VALUES
    ('CO4',   'The procedure code is inconsistent with the modifier', 'Coding Error'),
    ('CO11',  'The diagnosis is inconsistent with the procedure', 'Coding Error'),
    ('CO16',  'Claim / service lacks information which is needed for adjudication', 'Missing Information'),
    ('CO22',  'This care may be covered by another payer', 'COB'),
    ('CO26',  'Expenses incurred prior to coverage', 'Eligibility'),
    ('CO27',  'Expenses incurred after coverage terminated', 'Eligibility'),
    ('CO29',  'Claim submitted past timely filing deadline', 'Timely Filing'),
    ('CO45',  'Charges exceed your contracted/legislated fee arrangement', 'Contractual'),
    ('CO50',  'These are non-covered services because this is not deemed a medical necessity', 'Medical Necessity'),
    ('CO96',  'Non-covered charge(s)', 'Non-Covered'),
    ('CO97',  'The benefit for this service is included in the payment for another service', 'Bundling'),
    ('CO109', 'Claim not covered by this payer/contractor', 'Wrong Payer'),
    ('CO119', 'Benefit maximum for this time period has been reached', 'Benefit Limit'),
    ('CO167', 'This diagnosis is not covered', 'Diagnosis Not Covered'),
    ('CO197', 'Precertification/authorization/notification absent', 'Prior Auth'),
    ('PR1',   'Deductible amount', 'Patient Responsibility'),
    ('PR2',   'Coinsurance amount', 'Patient Responsibility'),
    ('PR3',   'Co-payment amount', 'Patient Responsibility'),
    ('PR96',  'Non-covered charge(s)', 'Patient Responsibility'),
    ('OA23',  'The impact of prior payer(s) adjudication including payments or adjustments', 'COB'),
    ('N1',    'Alert: You may appeal this decision', 'Alert'),
    ('N130',  'Consult plan benefit documents/guidelines for information about restrictions', 'Alert'),
    ('N432',  'Adjustment for administrative or other cost-savings', 'Administrative'),
    ('N570',  'Missing/incomplete/invalid credentialing data', 'Missing Information'),
    ('PI16',  'Claim submitted to incorrect payer', 'Wrong Payer');
END;

-- -- 2. CARC Payer Guidance -------------------------------------------------
IF OBJECT_ID('dbo.CarcPayerGuidance', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.CarcPayerGuidance (
    id           INT IDENTITY(1,1) PRIMARY KEY,
    carc_code    NVARCHAR(20)   NOT NULL,
    payer_name   NVARCHAR(255)  NULL,
    category     NVARCHAR(100)  NOT NULL,
    common_cause NVARCHAR(MAX)  NULL,
    resolution   NVARCHAR(MAX)  NULL,
    prevention   NVARCHAR(MAX)  NULL,
    created_at   DATETIME2      DEFAULT GETDATE(),
    INDEX IX_CarcGuidance_Code (carc_code, payer_name)
  );
END;

IF NOT EXISTS (SELECT 1 FROM dbo.CarcPayerGuidance WHERE carc_code = 'CO29')
BEGIN
  INSERT INTO dbo.CarcPayerGuidance (carc_code, payer_name, category, common_cause, resolution, prevention) VALUES
  -- Timely Filing
  ('CO29', NULL, 'Timely Filing',
   'Claim was not submitted within the payer''s filing deadline from date of service.',
   'Gather proof of timely filing (clearinghouse confirmation, system timestamps, EDI 277). Submit appeal with proof within the appeal window. If no proof exists, write off and document root cause.',
   'Configure billing system alerts at 60, 90, and 120 days post-DOS. Verify payer-specific deadlines in your fee schedule. Run weekly timely-filing aging reports.'),

  -- Prior Authorization
  ('CO197', NULL, 'Prior Auth',
   'Service rendered without prior authorization or notification to the payer.',
   'Check if retro-authorization is available (many payers allow 24-72h). Submit retro-auth request with clinical notes and medical necessity documentation. If denied, prepare medical necessity appeal.',
   'Implement pre-service auth verification for all scheduled procedures. Maintain a payer-specific auth requirements matrix. Auto-flag CPT codes requiring auth at charge entry.'),

  -- Medical Necessity
  ('CO50', NULL, 'Medical Necessity',
   'Payer determined the service was not medically necessary based on submitted diagnosis and documentation.',
   'Obtain treating provider clinical notes, history, and exam findings. Request peer-to-peer review with payer medical director. Submit appeal with supporting clinical evidence within appeal window.',
   'Ensure primary diagnosis accurately reflects clinical presentation. Train providers on LCD/NCD requirements. Use ICD-10 specificity - avoid unspecified codes for services with strict LCD guidance.'),

  -- Coding errors
  ('CO4', NULL, 'Coding Error',
   'Modifier is inconsistent with the procedure code - either missing, invalid, or contradictory.',
   'Review claim with coder. Correct modifier and resubmit as a corrected claim (frequency code 7). Attach explanation if payer requires.',
   'Train coders on modifier usage rules. Implement front-end edits in your billing system to flag mismatched modifier/procedure combos at charge entry.'),
  ('CO11', NULL, 'Coding Error',
   'The submitted diagnosis code does not support medical necessity for the billed procedure.',
   'Review chart documentation. Update to the most accurate and specific ICD-10 code. Resubmit as corrected claim.',
   'Provide coder training on diagnosis-procedure linkage. Use encoder software with bundled LCD/NCD guidance at code assignment.'),
  ('CO97', NULL, 'Bundling',
   'The secondary procedure is bundled into the primary procedure payment per CCI edits or payer policy.',
   'Check CCI edit - if a modifier exempts the edit, resubmit with modifier 59/XU/XS/XE/XP. If no modifier applies, write off the bundled charge.',
   'Run claims through a CCI edit checker before submission. Train coders on bundling rules and unbundling modifier requirements.'),

  -- Eligibility / Coverage
  ('CO27', NULL, 'Eligibility',
   'Patient coverage had lapsed or terminated before the date of service.',
   'Verify termination date with payer. Bill patient as self-pay per your ABN policy. Check for secondary coverage.',
   'Verify eligibility at every encounter - not just at registration. Use real-time eligibility verification via 270/271 transactions.'),
  ('CO26', NULL, 'Eligibility',
   'Date of service falls before the patient''s effective coverage date.',
   'Verify coverage effective date. Bill patient per your financial responsibility policy.',
   'Confirm effective date during registration. Do not schedule services until coverage is active if payment is a concern.'),

  -- Benefits / Limits
  ('CO119', NULL, 'Benefit Limit',
   'Patient has reached the maximum allowed benefit for this service category in the current benefit period.',
   'Notify patient of benefit exhaustion. Collect patient responsibility. Check for supplemental coverage.',
   'Track benefit utilization at intake. Verify remaining benefits for high-utilization service categories.'),

  -- COB
  ('OA23', NULL, 'COB',
   'Payment reduced due to COB with another payer - primary payer payment reduces secondary liability.',
   'Confirm primary EOB is attached and correctly represents payment. If secondary is underpaying, appeal with primary EOB and COB worksheet.',
   'Collect all insurance cards at intake. Verify COB order at every visit. Ensure primary claims are filed before secondary.'),

  -- Non-covered
  ('CO96', NULL, 'Non-Covered',
   'Service is excluded from coverage under the patient''s benefit plan.',
   'Issue ABN/patient financial responsibility notice. Collect from patient. Review plan exclusions for future reference.',
   'Obtain signed ABN before rendering non-covered services. Maintain an updated list of non-covered services per payer plan.'),

  -- Missing information
  ('CO16', NULL, 'Missing Information',
   'Claim is missing required data elements for processing (NPI, diagnosis, date of birth, etc.).',
   'Identify the missing/invalid field from the remittance remark code. Correct and resubmit. Most payers allow a single corrected submission.',
   'Implement claim scrubbing software to catch missing fields before submission. Conduct regular front-end data entry audits.'),

  -- Administrative
  ('N432', NULL, 'Administrative',
   'Payer applied an administrative cost-savings adjustment unrelated to clinical criteria.',
   'Review contract terms. If adjustment does not match contracted rates, submit an overpayment dispute with supporting contract language.',
   'Review payer remittances monthly for unexpected administrative adjustments. Flag N432 denials for contract management review.'),

  -- Medicare-specific overrides
  ('CO29', 'Medicare', 'Timely Filing',
   'Medicare requires claims within 1 year of date of service.',
   'Submit appeal with proof of timely filing. Medicare allows exceptions for administrative error or circumstances beyond provider control (Good Cause). Attach documentation of the delay reason.',
   'Medicare''s 365-day window is strict. File all Medicare claims within 90 days to avoid approaching the limit.');
END;

-- -- 3. Payer Filing Deadlines ----------------------------------------------
IF OBJECT_ID('dbo.PayerFilingDeadlines', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.PayerFilingDeadlines (
    id            INT IDENTITY(1,1) PRIMARY KEY,
    payer_name    NVARCHAR(255) NOT NULL,
    deadline_days INT           NOT NULL DEFAULT 180,
    appeal_days   INT           NOT NULL DEFAULT 60,
    notes         NVARCHAR(MAX) NULL,
    updated_at    DATETIME2     DEFAULT GETDATE()
  );
END;

IF NOT EXISTS (SELECT 1 FROM dbo.PayerFilingDeadlines WHERE payer_name = 'Medicare')
BEGIN
  INSERT INTO dbo.PayerFilingDeadlines (payer_name, deadline_days, appeal_days, notes) VALUES
    ('Medicare',  365, 120, 'One year from DOS; Good Cause exceptions available'),
    ('Medicaid',  365,  90, 'State Medicaid; deadline varies by state - verify locally'),
    ('Blue Cross', 180,  60, 'Most BCBS plans - verify plan-specific terms'),
    ('United',    180,  60, 'UnitedHealthcare commercial plans'),
    ('Aetna',     180,  60, 'Aetna commercial plans'),
    ('Cigna',     180,  60, 'Cigna commercial plans'),
    ('Humana',    180,  60, 'Humana commercial plans'),
    ('Default',   180,  60, 'Industry-standard default for unknown payers');
END;

-- -- 4. Appeal Letter Templates ---------------------------------------------
IF OBJECT_ID('dbo.AppealLetterTemplate', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.AppealLetterTemplate (
    id              INT IDENTITY(1,1) PRIMARY KEY,
    template_name   NVARCHAR(255) NOT NULL,
    denial_category NVARCHAR(100) NULL,
    carc_codes      NVARCHAR(500) NULL,
    subject_line    NVARCHAR(500) NOT NULL,
    body_template   NVARCHAR(MAX) NOT NULL,
    closing_text    NVARCHAR(MAX) NULL,
    is_active       BIT           DEFAULT 1,
    created_at      DATETIME2     DEFAULT GETDATE(),
    updated_at      DATETIME2     DEFAULT GETDATE()
  );
END;

IF NOT EXISTS (SELECT 1 FROM dbo.AppealLetterTemplate WHERE template_name = 'Timely Filing Appeal')
BEGIN
  INSERT INTO dbo.AppealLetterTemplate
    (template_name, denial_category, carc_codes, subject_line, body_template, closing_text)
  VALUES

  ('Timely Filing Appeal', 'Timely Filing', 'CO29',
   'Appeal: Timely Filing - Claim {{claim_id}} - {{patient_name}}',
   'Dear Claims Review Department,

We are writing to formally appeal the denial of claim {{claim_id}} for patient {{patient_name}} (DOS: {{dos}}) with {{payer_name}}.

This claim was denied under reason code CO-29 (Timely Filing). We respectfully dispute this denial and submit the following documentation as proof that the claim was submitted within the required filing window:

  - Original submission date: {{submission_date}}
  - Billed amount: {{charged_amount}}
  - Denial code: {{denial_code}} - {{denial_description}}

Attached to this appeal you will find clearinghouse submission confirmation records demonstrating that the claim was transmitted on {{submission_date}}, which falls within the applicable filing deadline.

{{custom_notes}}

We request that this claim be reconsidered and processed for payment in accordance with our provider agreement.',
   'Thank you for your prompt attention to this matter. Please confirm receipt and provide a decision within 30 days. For questions, contact our billing office.'),

  ('Medical Necessity Appeal', 'Medical Necessity', 'CO50',
   'Medical Necessity Appeal - Claim {{claim_id}} - {{patient_name}}',
   'Dear Medical Review Department,

We are appealing the medical necessity denial for claim {{claim_id}}, patient {{patient_name}}, DOS {{dos}}, billed to {{payer_name}}.

Denial code {{denial_code}} ({{denial_description}}) has been applied to this claim. We believe this denial is in error and that the service provided meets the criteria for medical necessity based on the patient''s clinical presentation and your plan''s coverage guidelines.

Charged amount: {{charged_amount}}
Provider: {{provider_name}}

Enclosed clinical documentation includes the treating provider''s notes, examination findings, relevant history, and supporting evidence demonstrating that the service was medically necessary and appropriate for this patient''s condition.

{{custom_notes}}

We respectfully request a full review of the attached clinical documentation and reversal of this denial.',
   'We are available for a peer-to-peer review at your request. Please respond within the contractually required timeframe.'),

  ('Prior Authorization Appeal', 'Prior Auth', 'CO197',
   'Prior Authorization Appeal - Claim {{claim_id}} - {{patient_name}}',
   'Dear Prior Authorization Review Department,

We are submitting this formal appeal for claim {{claim_id}}, patient {{patient_name}} (DOS: {{dos}}), denied by {{payer_name}} under reason code {{denial_code}} ({{denial_description}}).

Billed amount: {{charged_amount}} | Provider: {{provider_name}}

The denial states that prior authorization was absent. We provide the following context:

{{custom_notes}}

We have attached all relevant clinical documentation supporting the medical necessity of this service. We request retroactive authorization consideration and reprocessing of this claim.',
   'Please confirm receipt and provide your determination within your standard appeal timeframe.'),

  ('Coordination of Benefits Appeal', 'COB', 'OA23,CO22',
   'COB Appeal - Claim {{claim_id}} - {{patient_name}}',
   'Dear Claims Department,

This letter serves as a formal appeal for claim {{claim_id}}, patient {{patient_name}}, DOS {{dos}}, billed to {{payer_name}} for {{charged_amount}}.

Denial/adjustment code {{denial_code}} has been applied citing coordination of benefits. We are providing the primary payer''s Explanation of Benefits (EOB) and a completed COB worksheet to clarify the correct payment liability.

{{custom_notes}}

Please reprocess this claim in accordance with your COB policy and our provider agreement.',
   'If additional information is needed, please contact our billing office promptly.'),

  ('Duplicate Claim Dispute', 'Administrative', 'CO97',
   'Duplicate Claim Dispute - Claim {{claim_id}} - {{patient_name}}',
   'Dear Claims Department,

We are writing to dispute the denial of claim {{claim_id}} for patient {{patient_name}} (DOS: {{dos}}) submitted to {{payer_name}} for {{charged_amount}}.

This claim was denied under code {{denial_code}} ({{denial_description}}). We have verified that this is not a duplicate submission. The service referenced is distinct from any previously paid claim.

{{custom_notes}}

We request a review of your claim records and reprocessing of this claim.',
   'Please provide written confirmation of your determination.'),

  ('Incorrect Member ID Dispute', 'Eligibility', 'CO26,CO27',
   'Eligibility / Member ID Correction - Claim {{claim_id}} - {{patient_name}}',
   'Dear Eligibility Department,

We are appealing claim {{claim_id}} for patient {{patient_name}} (DOS: {{dos}}) denied by {{payer_name}} under reason code {{denial_code}} ({{denial_description}}).

Billed amount: {{charged_amount}}

Upon review, we have identified a demographic or coverage discrepancy that contributed to this denial. Corrected patient information and insurance verification documents are attached.

{{custom_notes}}

We request reprocessing of this claim with the corrected information.',
   'Thank you for your assistance in resolving this matter.'),

  ('General Appeal', NULL, NULL,
   'Appeal - Claim {{claim_id}} - {{patient_name}}',
   'Dear Claims Review Department,

We are formally appealing the denial of claim {{claim_id}} for patient {{patient_name}}, DOS {{dos}}, submitted to {{payer_name}} for {{charged_amount}}.

Denial code applied: {{denial_code}} - {{denial_description}}
Treating provider: {{provider_name}}
Original submission date: {{submission_date}}

{{custom_notes}}

We respectfully request a full review of this claim and reversal of the denial. Supporting documentation is attached.',
   'Please respond within the required appeal timeframe. Contact our billing office for any additional information needed.');
END;

-- -- 5. Verification --------------------------------------------------------
SELECT 'Carcs' AS tbl, COUNT(*) AS cnt FROM dbo.Carcs
UNION ALL
SELECT 'CarcPayerGuidance', COUNT(*) FROM dbo.CarcPayerGuidance
UNION ALL
SELECT 'PayerFilingDeadlines', COUNT(*) FROM dbo.PayerFilingDeadlines
UNION ALL
SELECT 'AppealLetterTemplate', COUNT(*) FROM dbo.AppealLetterTemplate;

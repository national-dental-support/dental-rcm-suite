-- @data: reference
-- @tags: clinical
-- clinical clinical/dental PMS tables
-- Auto-generated from source database

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='dbo' AND TABLE_NAME='Adjustment')
CREATE TABLE [dbo].[Adjustment] (
  [AdjNum] int IDENTITY(1,1) NOT NULL,
  [PatNum] int NOT NULL,
  [AdjDate] date NOT NULL,
  [AdjAmt] decimal(10, 2) NOT NULL DEFAULT ((0)),
  [AdjNote] nvarchar(255) NULL DEFAULT (''),
  [AdjType] nvarchar(100) NULL DEFAULT (''),
  [ProvNum] int NOT NULL DEFAULT ((0)),
  [created_at] datetime2 NULL DEFAULT (getutcdate()),
  CONSTRAINT [PK_Adjustment] PRIMARY KEY ([AdjNum])
);
GO

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='dbo' AND TABLE_NAME='Allergy')
CREATE TABLE [dbo].[Allergy] (
  [AllergyNum] int IDENTITY(1,1) NOT NULL,
  [PatNum] int NOT NULL,
  [AllergyName] nvarchar(255) NOT NULL DEFAULT (''),
  [Reaction] nvarchar(255) NULL DEFAULT (''),
  [Severity] nvarchar(50) NULL DEFAULT (''),
  [AllergyType] nvarchar(50) NULL DEFAULT ('Drug'),
  [DateAdverse] date NULL,
  [StatusIsActive] bit NOT NULL DEFAULT ((1)),
  [Note] nvarchar(MAX) NULL DEFAULT (''),
  [created_at] datetime2 NULL DEFAULT (getutcdate()),
  CONSTRAINT [PK_Allergy] PRIMARY KEY ([AllergyNum])
);
GO

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='dbo' AND TABLE_NAME='Appointment')
CREATE TABLE [dbo].[Appointment] (
  [AptNum] int IDENTITY(1,1) NOT NULL,
  [PatNum] int NOT NULL,
  [ProvNum] int NOT NULL DEFAULT ((0)),
  [ProvHyg] int NOT NULL DEFAULT ((0)),
  [AptStatus] tinyint NOT NULL DEFAULT ((0)),
  [AptDateTime] datetime2 NOT NULL,
  [AptDateEnd] datetime2 NULL,
  [Pattern] nvarchar(255) NOT NULL DEFAULT (''),
  [Note] nvarchar(MAX) NOT NULL DEFAULT (''),
  [ProcDescript] nvarchar(255) NOT NULL DEFAULT (''),
  [IsNewPatient] bit NOT NULL DEFAULT ((0)),
  [Confirmed] smallint NOT NULL DEFAULT ((0)),
  [created_at] datetime2 NOT NULL DEFAULT (getutcdate()),
  [updated_at] datetime2 NOT NULL DEFAULT (getutcdate()),
  [OpNum] int NULL,
  CONSTRAINT [PK_Appointment] PRIMARY KEY ([AptNum])
);
GO

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='dbo' AND TABLE_NAME='AppointmentType')
CREATE TABLE [dbo].[AppointmentType] (
  [AptTypeNum] int IDENTITY(1,1) NOT NULL,
  [AppTypeName] nvarchar(100) NOT NULL,
  [AppTypeColor] nvarchar(10) NULL DEFAULT ('#1976d2'),
  [Duration] int NULL DEFAULT ((30)),
  [IsHidden] bit NULL DEFAULT ((0)),
  [created_at] datetime2 NULL DEFAULT (getdate()),
  CONSTRAINT [PK_AppointmentType] PRIMARY KEY ([AptTypeNum])
);
GO

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='dbo' AND TABLE_NAME='ClaimAppeal')
CREATE TABLE [dbo].[ClaimAppeal] (
  [AppealNum] int IDENTITY(1,1) NOT NULL,
  [ClaimNum] int NOT NULL,
  [PatNum] int NOT NULL,
  [DateFiled] datetime2 NULL DEFAULT (getutcdate()),
  [Deadline] datetime2 NULL,
  [Status] tinyint NULL DEFAULT ((0)),
  [DenialReason] nvarchar(200) NULL,
  [AppealReason] nvarchar(MAX) NULL,
  [OutcomeNote] nvarchar(MAX) NULL,
  [AmountAppealed] decimal(10, 2) NULL DEFAULT ((0)),
  [AmountRecovered] decimal(10, 2) NULL DEFAULT ((0)),
  [created_at] datetime2 NULL DEFAULT (getutcdate()),
  [updated_at] datetime2 NULL DEFAULT (getutcdate()),
  CONSTRAINT [PK_ClaimAppeal] PRIMARY KEY ([AppealNum])
);
GO

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='dbo' AND TABLE_NAME='Commlog')
CREATE TABLE [dbo].[Commlog] (
  [CommlogNum] int IDENTITY(1,1) NOT NULL,
  [PatNum] int NOT NULL,
  [CommDateTime] datetime2 NOT NULL DEFAULT (getutcdate()),
  [CommType] nvarchar(50) NOT NULL DEFAULT ('Note'),
  [Mode] tinyint NOT NULL DEFAULT ((0)),
  [IsCompleted] bit NOT NULL DEFAULT ((1)),
  [Note] nvarchar(MAX) NOT NULL DEFAULT (''),
  [UserNum] int NOT NULL DEFAULT ((0)),
  [created_at] datetime2 NULL DEFAULT (getutcdate()),
  CONSTRAINT [PK_Commlog] PRIMARY KEY ([CommlogNum])
);
GO

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='dbo' AND TABLE_NAME='Fee')
CREATE TABLE [dbo].[Fee] (
  [FeeNum] int IDENTITY(1,1) NOT NULL,
  [FeeSchedNum] int NOT NULL,
  [ProcCode] nvarchar(15) NOT NULL,
  [Amount] decimal(10, 2) NOT NULL DEFAULT ((0)),
  [created_at] datetime2 NULL DEFAULT (getutcdate()),
  [updated_at] datetime2 NULL DEFAULT (getutcdate()),
  CONSTRAINT [PK_Fee] PRIMARY KEY ([FeeNum])
);
GO

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='dbo' AND TABLE_NAME='FeeSched')
CREATE TABLE [dbo].[FeeSched] (
  [FeeSchedNum] int IDENTITY(1,1) NOT NULL,
  [Description] nvarchar(255) NOT NULL,
  [FeeSchedType] tinyint NOT NULL DEFAULT ((0)),
  [IsGlobal] bit NOT NULL DEFAULT ((0)),
  [created_at] datetime2 NULL DEFAULT (getutcdate()),
  CONSTRAINT [PK_FeeSched] PRIMARY KEY ([FeeSchedNum])
);
GO

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='dbo' AND TABLE_NAME='InsPlan')
CREATE TABLE [dbo].[InsPlan] (
  [PlanNum] int IDENTITY(1,1) NOT NULL,
  [Subscriber] int NOT NULL DEFAULT ((0)),
  [Carrier] nvarchar(100) NOT NULL DEFAULT (''),
  [CarrierNum] int NOT NULL DEFAULT ((0)),
  [GroupName] nvarchar(100) NOT NULL DEFAULT (''),
  [GroupNum] nvarchar(40) NOT NULL DEFAULT (''),
  [SubscriberID] nvarchar(40) NOT NULL DEFAULT (''),
  [DateEffective] date NULL,
  [DateTerm] date NULL,
  [Phone] nvarchar(30) NOT NULL DEFAULT (''),
  [Address] nvarchar(100) NOT NULL DEFAULT (''),
  [City] nvarchar(60) NOT NULL DEFAULT (''),
  [State] nvarchar(2) NOT NULL DEFAULT (''),
  [Zip] nvarchar(10) NOT NULL DEFAULT (''),
  [AnnualMax] smallint NOT NULL DEFAULT ((0)),
  [Deductible] smallint NOT NULL DEFAULT ((0)),
  [OrthoMax] smallint NOT NULL DEFAULT ((0)),
  [PlanType] nvarchar(1) NOT NULL DEFAULT (''),
  [RenewMonth] tinyint NOT NULL DEFAULT ((1)),
  [created_at] datetime2 NOT NULL DEFAULT (getutcdate()),
  [PrevPercent] smallint NOT NULL DEFAULT ((100)),
  [BasicPercent] smallint NOT NULL DEFAULT ((80)),
  [MajorPercent] smallint NOT NULL DEFAULT ((50)),
  [OrthoPercent] smallint NOT NULL DEFAULT ((50)),
  [CoverageNote] nvarchar(500) NOT NULL DEFAULT (''),
  [payer_id] smallint NULL,
  CONSTRAINT [PK_InsPlan] PRIMARY KEY ([PlanNum])
);
GO

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='dbo' AND TABLE_NAME='LabCase')
CREATE TABLE [dbo].[LabCase] (
  [LabCaseNum] int IDENTITY(1,1) NOT NULL,
  [PatNum] int NOT NULL,
  [AptNum] int NOT NULL DEFAULT ((0)),
  [Laboratory] nvarchar(255) NOT NULL DEFAULT (''),
  [Phone] nvarchar(30) NULL DEFAULT (''),
  [Description] nvarchar(MAX) NULL DEFAULT (''),
  [Instructions] nvarchar(MAX) NULL DEFAULT (''),
  [ToothNums] nvarchar(100) NULL DEFAULT (''),
  [Shade] nvarchar(50) NULL DEFAULT (''),
  [DateSent] date NULL,
  [DateDue] date NULL,
  [DateRecd] date NULL,
  [CaseStatus] tinyint NOT NULL DEFAULT ((0)),
  [Fee] decimal(10, 2) NULL DEFAULT ((0)),
  [Note] nvarchar(MAX) NULL DEFAULT (''),
  [created_at] datetime2 NULL DEFAULT (getutcdate()),
  [updated_at] datetime2 NULL DEFAULT (getutcdate()),
  CONSTRAINT [PK_LabCase] PRIMARY KEY ([LabCaseNum])
);
GO

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='dbo' AND TABLE_NAME='MedPat')
CREATE TABLE [dbo].[MedPat] (
  [MedPatNum] int IDENTITY(1,1) NOT NULL,
  [PatNum] int NOT NULL,
  [MedName] nvarchar(255) NOT NULL DEFAULT (''),
  [PatNote] nvarchar(MAX) NULL DEFAULT (''),
  [DateStart] date NULL,
  [DateStop] date NULL,
  [DosageText] nvarchar(255) NULL DEFAULT (''),
  [Strength] nvarchar(100) NULL DEFAULT (''),
  [IsActive] bit NOT NULL DEFAULT ((1)),
  [created_at] datetime2 NULL DEFAULT (getutcdate()),
  CONSTRAINT [PK_MedPat] PRIMARY KEY ([MedPatNum])
);
GO

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='dbo' AND TABLE_NAME='Operatory')
CREATE TABLE [dbo].[Operatory] (
  [OpNum] int IDENTITY(1,1) NOT NULL,
  [OpName] nvarchar(100) NOT NULL DEFAULT (''),
  [Abbr] nvarchar(10) NOT NULL DEFAULT (''),
  [IsHidden] bit NOT NULL DEFAULT ((0)),
  [ItemOrder] smallint NOT NULL DEFAULT ((0)),
  [Note] nvarchar(255) NOT NULL DEFAULT (''),
  CONSTRAINT [PK_Operatory] PRIMARY KEY ([OpNum])
);
GO

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='dbo' AND TABLE_NAME='OrthoCase')
CREATE TABLE [dbo].[OrthoCase] (
  [OrthoCaseNum] int IDENTITY(1,1) NOT NULL,
  [PatNum] int NOT NULL,
  [ProvNum] int NOT NULL DEFAULT ((0)),
  [StartDate] date NULL,
  [PlannedEndDate] date NULL,
  [ActualEndDate] date NULL,
  [TxType] nvarchar(50) NOT NULL DEFAULT (''),
  [BracketType] nvarchar(100) NOT NULL DEFAULT (''),
  [WireSequence] nvarchar(500) NOT NULL DEFAULT (''),
  [TotalVisits] smallint NOT NULL DEFAULT ((0)),
  [Fee] decimal(10, 2) NOT NULL DEFAULT ((0)),
  [Status] nvarchar(20) NOT NULL DEFAULT ('active'),
  [Notes] nvarchar(MAX) NOT NULL DEFAULT (''),
  [created_at] datetime2 NOT NULL DEFAULT (getutcdate()),
  [updated_at] datetime2 NOT NULL DEFAULT (getutcdate()),
  CONSTRAINT [PK_OrthoCase] PRIMARY KEY ([OrthoCaseNum])
);
GO

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='dbo' AND TABLE_NAME='OrthoVisit')
CREATE TABLE [dbo].[OrthoVisit] (
  [VisitNum] int IDENTITY(1,1) NOT NULL,
  [OrthoCaseNum] int NOT NULL,
  [PatNum] int NOT NULL,
  [VisitDate] date NOT NULL,
  [StageNum] smallint NOT NULL DEFAULT ((0)),
  [WireUsed] nvarchar(100) NOT NULL DEFAULT (''),
  [Findings] nvarchar(500) NOT NULL DEFAULT (''),
  [NextVisitDate] date NULL,
  [ProvNum] int NOT NULL DEFAULT ((0)),
  [created_at] datetime2 NOT NULL DEFAULT (getutcdate()),
  CONSTRAINT [PK_OrthoVisit] PRIMARY KEY ([VisitNum])
);
GO

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='dbo' AND TABLE_NAME='PatientFamily')
CREATE TABLE [dbo].[PatientFamily] (
  [FamilyNum] int IDENTITY(1,1) NOT NULL,
  [Guarantor] int NOT NULL,
  [PatNum] int NOT NULL,
  [Relation] nvarchar(30) NULL,
  [created_at] datetime2 NOT NULL DEFAULT (getutcdate()),
  CONSTRAINT [PK_PatientFamily] PRIMARY KEY ([FamilyNum])
);
GO

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='dbo' AND TABLE_NAME='PatImage')
CREATE TABLE [dbo].[PatImage] (
  [ImageNum] int IDENTITY(1,1) NOT NULL,
  [PatNum] int NOT NULL,
  [ImageType] nvarchar(30) NOT NULL DEFAULT ('intraoral'),
  [ToothNum] nvarchar(5) NOT NULL DEFAULT (''),
  [FileName] nvarchar(300) NOT NULL,
  [FilePath] nvarchar(500) NOT NULL,
  [Caption] nvarchar(200) NOT NULL DEFAULT (''),
  [TakenAt] date NULL,
  [UploadedAt] datetime2 NOT NULL DEFAULT (getutcdate()),
  CONSTRAINT [PK_PatImage] PRIMARY KEY ([ImageNum])
);
GO

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='dbo' AND TABLE_NAME='PatNote')
CREATE TABLE [dbo].[PatNote] (
  [PatNoteNum] int IDENTITY(1,1) NOT NULL,
  [PatNum] int NOT NULL,
  [ProvNum] int NOT NULL,
  [NoteDate] datetime2 NOT NULL DEFAULT (getutcdate()),
  [NoteType] tinyint NOT NULL DEFAULT ((0)),
  [Note] nvarchar(MAX) NULL,
  [created_at] datetime2 NOT NULL DEFAULT (getutcdate()),
  CONSTRAINT [PK_PatNote] PRIMARY KEY ([PatNoteNum])
);
GO

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='dbo' AND TABLE_NAME='Payment')
CREATE TABLE [dbo].[Payment] (
  [PayNum] int IDENTITY(1,1) NOT NULL,
  [PatNum] int NOT NULL,
  [PayType] smallint NOT NULL DEFAULT ((0)),
  [PayDate] date NOT NULL,
  [PayAmt] decimal(10, 2) NOT NULL DEFAULT ((0)),
  [CheckNum] nvarchar(25) NOT NULL DEFAULT (''),
  [PayNote] nvarchar(255) NOT NULL DEFAULT (''),
  [created_at] datetime2 NOT NULL DEFAULT (getutcdate()),
  [ClaimId] nvarchar(50) NULL,
  [is_voided] bit NULL DEFAULT ((0)),
  [void_reason] nvarchar(200) NULL,
  CONSTRAINT [PK_Payment] PRIMARY KEY ([PayNum])
);
GO

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='dbo' AND TABLE_NAME='PayPlan')
CREATE TABLE [dbo].[PayPlan] (
  [PayPlanNum] int IDENTITY(1,1) NOT NULL,
  [PatNum] int NOT NULL,
  [Guarantor] int NOT NULL DEFAULT ((0)),
  [PayPlanDate] date NOT NULL,
  [APR] decimal(5, 3) NOT NULL DEFAULT ((0)),
  [TermsStr] nvarchar(255) NULL DEFAULT (''),
  [PlanCategory] nvarchar(50) NULL DEFAULT (''),
  [Signature] nvarchar(255) NULL DEFAULT (''),
  [Note] nvarchar(MAX) NULL DEFAULT (''),
  [NumberOfPayments] smallint NOT NULL DEFAULT ((1)),
  [PaymentAmount] decimal(10, 2) NOT NULL DEFAULT ((0)),
  [TotalAmount] decimal(10, 2) NOT NULL DEFAULT ((0)),
  [AmountPaid] decimal(10, 2) NOT NULL DEFAULT ((0)),
  [PayPlanStatus] tinyint NOT NULL DEFAULT ((0)),
  [created_at] datetime2 NULL DEFAULT (getutcdate()),
  [updated_at] datetime2 NULL DEFAULT (getutcdate()),
  CONSTRAINT [PK_PayPlan] PRIMARY KEY ([PayPlanNum])
);
GO

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='dbo' AND TABLE_NAME='PerioExam')
CREATE TABLE [dbo].[PerioExam] (
  [PerioExamNum] int IDENTITY(1,1) NOT NULL,
  [PatNum] int NOT NULL,
  [ProvNum] int NOT NULL,
  [ExamDate] datetime2 NOT NULL DEFAULT (getutcdate()),
  [Note] nvarchar(500) NULL,
  [created_at] datetime2 NOT NULL DEFAULT (getutcdate()),
  CONSTRAINT [PK_PerioExam] PRIMARY KEY ([PerioExamNum])
);
GO

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='dbo' AND TABLE_NAME='PerioMeasure')
CREATE TABLE [dbo].[PerioMeasure] (
  [PerioMeasureNum] int IDENTITY(1,1) NOT NULL,
  [PerioExamNum] int NOT NULL,
  [SequenceType] tinyint NOT NULL,
  [ToothValue] nvarchar(MAX) NULL,
  CONSTRAINT [PK_PerioMeasure] PRIMARY KEY ([PerioMeasureNum])
);
GO

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='dbo' AND TABLE_NAME='PreAuth')
CREATE TABLE [dbo].[PreAuth] (
  [PreAuthNum] int IDENTITY(1,1) NOT NULL,
  [PatNum] int NOT NULL,
  [PlanNum] int NOT NULL,
  [ClaimNum] int NULL,
  [DateRequested] datetime2 NULL,
  [DateResponse] datetime2 NULL,
  [PreAuthCode] nvarchar(50) NULL,
  [Status] tinyint NOT NULL DEFAULT ((0)),
  [ApprovedFee] decimal(10, 2) NULL,
  [Note] nvarchar(MAX) NULL,
  [ProcCodes] nvarchar(500) NULL,
  [created_at] datetime2 NOT NULL DEFAULT (getutcdate()),
  [updated_at] datetime2 NOT NULL DEFAULT (getutcdate()),
  CONSTRAINT [PK_PreAuth] PRIMARY KEY ([PreAuthNum])
);
GO

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='dbo' AND TABLE_NAME='ProcCode')
CREATE TABLE [dbo].[ProcCode] (
  [ProcCode] nvarchar(15) NOT NULL,
  [Description] nvarchar(255) NOT NULL DEFAULT (''),
  [AbbrDesc] nvarchar(25) NULL DEFAULT (''),
  [Category] nvarchar(100) NULL DEFAULT (''),
  [TreatArea] tinyint NOT NULL DEFAULT ((0)),
  [NoBillIns] bit NOT NULL DEFAULT ((0)),
  [IsRadiology] bit NOT NULL DEFAULT ((0)),
  [DefaultNote] nvarchar(MAX) NULL DEFAULT (''),
  [created_at] datetime2 NULL DEFAULT (getutcdate()),
  [updated_at] datetime2 NULL DEFAULT (getutcdate()),
  CONSTRAINT [PK_ProcCode] PRIMARY KEY ([ProcCode])
);
GO

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='dbo' AND TABLE_NAME='ProcedureLog')
CREATE TABLE [dbo].[ProcedureLog] (
  [ProcNum] int IDENTITY(1,1) NOT NULL,
  [PatNum] int NOT NULL,
  [AptNum] int NOT NULL DEFAULT ((0)),
  [ProvNum] int NOT NULL DEFAULT ((0)),
  [ADACode] nvarchar(15) NOT NULL DEFAULT (''),
  [ProcDate] date NULL,
  [ProcFee] decimal(10, 2) NOT NULL DEFAULT ((0)),
  [ProcStatus] tinyint NOT NULL DEFAULT ((0)),
  [Surf] nvarchar(10) NOT NULL DEFAULT (''),
  [ToothNum] nvarchar(2) NOT NULL DEFAULT (''),
  [ToothRange] nvarchar(100) NOT NULL DEFAULT (''),
  [NoBillIns] bit NOT NULL DEFAULT ((0)),
  [ProcNote] nvarchar(MAX) NOT NULL DEFAULT (''),
  [created_at] datetime2 NOT NULL DEFAULT (getutcdate()),
  [ClaimNum] int NULL,
  CONSTRAINT [PK_ProcedureLog] PRIMARY KEY ([ProcNum])
);
GO

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='dbo' AND TABLE_NAME='Recall')
CREATE TABLE [dbo].[Recall] (
  [RecallNum] int IDENTITY(1,1) NOT NULL,
  [PatNum] int NOT NULL,
  [RecallType] nvarchar(50) NOT NULL DEFAULT ('Prophylaxis'),
  [DateDue] date NULL,
  [DateLastProc] date NULL,
  [RecallStatus] tinyint NOT NULL DEFAULT ((0)),
  [Interval] smallint NOT NULL DEFAULT ((6)),
  [Note] nvarchar(MAX) NULL DEFAULT (''),
  [IsDisabled] bit NOT NULL DEFAULT ((0)),
  [created_at] datetime2 NULL DEFAULT (getutcdate()),
  [updated_at] datetime2 NULL DEFAULT (getutcdate()),
  CONSTRAINT [PK_Recall] PRIMARY KEY ([RecallNum])
);
GO

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='dbo' AND TABLE_NAME='RecallType')
CREATE TABLE [dbo].[RecallType] (
  [RecallTypeNum] int IDENTITY(1,1) NOT NULL,
  [Description] nvarchar(100) NOT NULL,
  [DefaultInterval] int NULL DEFAULT ((6)),
  [DefaultProcCode] nvarchar(20) NULL,
  [IsHidden] bit NULL DEFAULT ((0)),
  [created_at] datetime2 NULL DEFAULT (getdate()),
  CONSTRAINT [PK_RecallType] PRIMARY KEY ([RecallTypeNum])
);
GO

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='dbo' AND TABLE_NAME='Referral')
CREATE TABLE [dbo].[Referral] (
  [ReferralNum] int IDENTITY(1,1) NOT NULL,
  [PatNum] int NOT NULL,
  [RefType] nvarchar(20) NOT NULL DEFAULT ('Out'),
  [ReferralDate] date NOT NULL,
  [ProvName] nvarchar(255) NOT NULL DEFAULT (''),
  [Specialty] nvarchar(100) NULL DEFAULT (''),
  [RefReason] nvarchar(MAX) NULL DEFAULT (''),
  [ProcCodes] nvarchar(255) NULL DEFAULT (''),
  [Note] nvarchar(MAX) NULL DEFAULT (''),
  [Status] nvarchar(50) NOT NULL DEFAULT ('Pending'),
  [DateScheduled] date NULL,
  [DateCompleted] date NULL,
  [created_at] datetime2 NULL DEFAULT (getutcdate()),
  [updated_at] datetime2 NULL DEFAULT (getutcdate()),
  CONSTRAINT [PK_Referral] PRIMARY KEY ([ReferralNum])
);
GO

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='dbo' AND TABLE_NAME='Rx')
CREATE TABLE [dbo].[Rx] (
  [RxNum] int IDENTITY(1,1) NOT NULL,
  [PatNum] int NOT NULL,
  [ProvNum] int NOT NULL DEFAULT ((0)),
  [RxDate] date NULL,
  [Drug] nvarchar(255) NOT NULL DEFAULT (''),
  [Sig] nvarchar(255) NULL DEFAULT (''),
  [Disp] nvarchar(100) NULL DEFAULT (''),
  [Refills] nvarchar(20) NULL DEFAULT ('0'),
  [Notes] nvarchar(MAX) NULL DEFAULT (''),
  [IsControlled] bit NOT NULL DEFAULT ((0)),
  [SendStatus] tinyint NOT NULL DEFAULT ((0)),
  [created_at] datetime2 NULL DEFAULT (getutcdate()),
  [updated_at] datetime2 NULL DEFAULT (getutcdate()),
  CONSTRAINT [PK_Rx] PRIMARY KEY ([RxNum])
);
GO

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='dbo' AND TABLE_NAME='SchedBlock')
CREATE TABLE [dbo].[SchedBlock] (
  [BlockNum] int IDENTITY(1,1) NOT NULL,
  [ProvNum] int NOT NULL DEFAULT ((0)),
  [OpNum] int NOT NULL DEFAULT ((0)),
  [BlockDate] date NOT NULL,
  [StartTime] time NOT NULL,
  [StopTime] time NOT NULL,
  [BlockType] tinyint NOT NULL DEFAULT ((0)),
  [Note] nvarchar(200) NOT NULL DEFAULT (''),
  [IsRecurring] bit NOT NULL DEFAULT ((0)),
  [RecurDOW] tinyint NOT NULL DEFAULT ((0)),
  [created_at] datetime2 NOT NULL DEFAULT (getutcdate()),
  [updated_at] datetime2 NOT NULL DEFAULT (getutcdate()),
  CONSTRAINT [PK_SchedBlock] PRIMARY KEY ([BlockNum])
);
GO

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='dbo' AND TABLE_NAME='ToothInitial')
CREATE TABLE [dbo].[ToothInitial] (
  [ToothInitialNum] int IDENTITY(1,1) NOT NULL,
  [PatNum] int NOT NULL,
  [ToothNum] nvarchar(5) NOT NULL,
  [InitialType] tinyint NULL,
  [Surf] nvarchar(10) NULL,
  [DrawingSegment] int NULL,
  [Note] nvarchar(200) NULL,
  [created_at] datetime2 NOT NULL DEFAULT (getutcdate()),
  CONSTRAINT [PK_ToothInitial] PRIMARY KEY ([ToothInitialNum])
);
GO

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='dbo' AND TABLE_NAME='TreatPlan')
CREATE TABLE [dbo].[TreatPlan] (
  [TreatPlanNum] int IDENTITY(1,1) NOT NULL,
  [PatNum] int NOT NULL,
  [Heading] nvarchar(255) NOT NULL DEFAULT ('Treatment Plan'),
  [Note] nvarchar(MAX) NULL DEFAULT (''),
  [TPStatus] tinyint NOT NULL DEFAULT ((0)),
  [DateTP] date NULL,
  [DateSigned] date NULL,
  [SignatureText] nvarchar(255) NULL DEFAULT (''),
  [ProvNum] int NOT NULL DEFAULT ((0)),
  [created_at] datetime2 NULL DEFAULT (getutcdate()),
  [updated_at] datetime2 NULL DEFAULT (getutcdate()),
  [DatePresented] datetime2 NULL,
  [RejectReason] nvarchar(200) NULL,
  CONSTRAINT [PK_TreatPlan] PRIMARY KEY ([TreatPlanNum])
);
GO

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='dbo' AND TABLE_NAME='TreatPlanProc')
CREATE TABLE [dbo].[TreatPlanProc] (
  [TreatPlanProcNum] int IDENTITY(1,1) NOT NULL,
  [TreatPlanNum] int NOT NULL,
  [ProcNum] int NOT NULL DEFAULT ((0)),
  [PatNum] int NOT NULL,
  [ADACode] nvarchar(15) NOT NULL DEFAULT (''),
  [Description] nvarchar(255) NULL DEFAULT (''),
  [ToothNum] nvarchar(2) NULL DEFAULT (''),
  [Surf] nvarchar(10) NULL DEFAULT (''),
  [ProcFee] decimal(10, 2) NOT NULL DEFAULT ((0)),
  [ProvNum] int NOT NULL DEFAULT ((0)),
  [Priority] int NOT NULL DEFAULT ((0)),
  [ProcStatus] tinyint NOT NULL DEFAULT ((0)),
  [created_at] datetime2 NULL DEFAULT (getutcdate()),
  CONSTRAINT [PK_TreatPlanProc] PRIMARY KEY ([TreatPlanProcNum])
);
GO

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='dbo' AND TABLE_NAME='Vitals')
CREATE TABLE [dbo].[Vitals] (
  [VitalsNum] int IDENTITY(1,1) NOT NULL,
  [PatNum] int NOT NULL,
  [DateTaken] datetime2 NOT NULL DEFAULT (getutcdate()),
  [Height] decimal(5, 2) NULL,
  [Weight] decimal(6, 2) NULL,
  [BpSystolic] int NULL,
  [BpDiastolic] int NULL,
  [Pulse] int NULL,
  [Temperature] decimal(5, 2) NULL,
  [O2Sat] decimal(5, 2) NULL,
  [Notes] nvarchar(500) NULL,
  [created_at] datetime2 NOT NULL DEFAULT (getutcdate()),
  CONSTRAINT [PK_Vitals] PRIMARY KEY ([VitalsNum])
);
GO

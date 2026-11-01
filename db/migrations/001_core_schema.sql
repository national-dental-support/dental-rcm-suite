-- @data: reference
-- @tags: core
-- Core + Product schema tables
-- Auto-generated from source database

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='archive' AND TABLE_NAME='zclaimhistory')
CREATE TABLE [archive].[zclaimhistory] (
  [ClaimHistoryId] nvarchar(50) NULL,
  [ServiceLineId] nvarchar(50) NULL,
  [ClaimID] nvarchar(50) NULL,
  [DateOfService] date NULL,
  [Accepted] bit NULL,
  [AuthorizationId] nvarchar(50) NULL,
  [ClaimStatus] nvarchar(50) NULL,
  [ClaimSubmittedDate] date NULL,
  [ClaimRejectedDate] date NULL,
  [InsuranceClaimSubmissionAttempt] tinyint NULL,
  [IsClaimDenied] bit NULL,
  [CarcCode] nvarchar(50) NULL,
  [AssignedTo] int NULL,
  [ClaimWorkStartedTime] datetime2 NULL,
  [ClaimWorkEndedTime] datetime2 NULL,
  [ContractualAdjustments] float NULL,
  [Progress] float NULL,
  [ClaimModifiedDate] date NULL,
  [ClaimBalanceDue] float NULL
);
GO

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='archive' AND TABLE_NAME='zclaims')
CREATE TABLE [archive].[zclaims] (
  [ClaimID] nvarchar(50) NULL,
  [PatientID] nvarchar(50) NULL,
  [PayerID] smallint NULL,
  [ProviderID] smallint NULL,
  [DateOfService] date NULL,
  [ChargeAmt] float NULL,
  [ClaimSubmittedDate] date NULL,
  [InsuranceClaimID] nvarchar(50) NULL
);
GO

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='archive' AND TABLE_NAME='zcontractDetails')
CREATE TABLE [archive].[zcontractDetails] (
  [PayerContractID] int NULL,
  [PayerID] smallint NULL,
  [ContractNumber] nvarchar(50) NULL,
  [ContractPlanName] nvarchar(50) NULL,
  [MailedDate] date NULL,
  [ReceivedDate] date NULL,
  [DateSigned] date NULL,
  [EffectiveDate] date NULL,
  [ExpirationDate] date NULL,
  [ContractStatusID] tinyint NULL,
  [ContractTypeID] tinyint NULL,
  [PlanNumber] nvarchar(50) NULL,
  [GroupNumber] nvarchar(50) NULL,
  [PayerMixClassID] tinyint NULL,
  [Website] nvarchar(50) NULL,
  [ContractType] nvarchar(50) NULL
);
GO

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='archive' AND TABLE_NAME='zrejectedclaims')
CREATE TABLE [archive].[zrejectedclaims] (
  [RejectedClaimID] nvarchar(50) NOT NULL,
  [ClaimID] nvarchar(50) NOT NULL,
  [RuleID] varchar(50) NOT NULL,
  [CreateDate] date NOT NULL
);
GO

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='archive' AND TABLE_NAME='zruleshistory')
CREATE TABLE [archive].[zruleshistory] (
  [RulesHistoryID] nvarchar(50) NOT NULL,
  [RuleID] varchar(50) NOT NULL,
  [ModifiedDate] date NOT NULL,
  [ModifiedBy] nvarchar(50) NOT NULL,
  [LastRuleName] nvarchar(50) NOT NULL,
  [LastRuleCategory] nvarchar(50) NOT NULL,
  [LastRuleType] nvarchar(50) NOT NULL,
  [RuleActivationID] tinyint NOT NULL
);
GO

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='archive' AND TABLE_NAME='zserviceline')
CREATE TABLE [archive].[zserviceline] (
  [ServiceLineID] nvarchar(50) NULL,
  [ClaimID] nvarchar(50) NULL,
  [PatientID] nvarchar(50) NULL,
  [PayerID] smallint NULL,
  [ProviderID] smallint NULL,
  [DateOfService] date NULL,
  [ContractedRate] float NULL,
  [ContractualAdjustments] float NULL,
  [CPT] nvarchar(50) NULL,
  [ProcedureDescription] nvarchar(50) NULL,
  [PrimarySecondaryTertiary] nvarchar(50) NULL
);
GO

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='archive' AND TABLE_NAME='ztransactions')
CREATE TABLE [archive].[ztransactions] (
  [TransactionID] nvarchar(50) NULL,
  [ClaimID] nvarchar(50) NULL,
  [PayerID] smallint NULL,
  [Quarter] tinyint NULL,
  [AdjustedCharges] float NULL,
  [PaymentPostDate] date NULL,
  [CurrentPeriodCharges] float NULL,
  [Uncollectable] float NULL,
  [TotalRCMCosts] float NULL,
  [PostingError] nvarchar(50) NULL,
  [LastPeriodCharges] float NULL,
  [ProcedureDescription] nvarchar(50) NULL,
  [RemittanceType] nvarchar(50) NULL,
  [CashTransferID] nvarchar(50) NULL,
  [ReasonCode] nvarchar(50) NULL,
  [CashTransferStart] date NULL,
  [CashTransferEnd] date NULL,
  [Unapplieds] float NULL,
  [ContractedRate] float NULL,
  [PostDate] date NULL,
  [AgeBucket] nvarchar(50) NULL,
  [TrxType] nvarchar(50) NULL,
  [TrxAmt] float NULL,
  [BillingCategory] nvarchar(50) NULL,
  [PendingChgsAmt] float NULL,
  [PendingNumPat] tinyint NULL,
  [UnappliedChgsAmt] float NULL,
  [UnappliedNumPat] tinyint NULL,
  [Balance] float NULL,
  [PayerType] nvarchar(50) NULL,
  [CoPayAmount] float NULL,
  [DeductableAmount] float NULL,
  [ClaimSubmittedDate] date NULL,
  [DepositCreated] nvarchar(1) NULL,
  [Network] nvarchar(1) NULL,
  [CPT] nvarchar(10) NULL
);
GO

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='dbo' AND TABLE_NAME='actions')
CREATE TABLE [dbo].[actions] (
  [ActionID] varchar(50) NULL,
  [ActionName] varchar(50) NULL
);
GO

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='dbo' AND TABLE_NAME='AdminAuditLog')
CREATE TABLE [dbo].[AdminAuditLog] (
  [id] int IDENTITY(1,1) NOT NULL,
  [actor_id] nvarchar(255) NOT NULL,
  [actor_role] nvarchar(50) NOT NULL,
  [action] nvarchar(100) NOT NULL,
  [target_id] nvarchar(255) NULL,
  [before_state] nvarchar(MAX) NULL,
  [after_state] nvarchar(MAX) NULL,
  [ip_address] nvarchar(45) NULL,
  [session_id] nvarchar(100) NULL,
  [timestamp] datetime2 NOT NULL DEFAULT (getutcdate()),
  [created_at] datetime2 NOT NULL DEFAULT (getutcdate()),
  [entity_type] nvarchar(50) NULL,
  [phi_fields] nvarchar(MAX) NULL,
  [user_agent] nvarchar(500) NULL,
  CONSTRAINT [PK_AdminAuditLog] PRIMARY KEY ([id])
);
GO

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='dbo' AND TABLE_NAME='AnalyticsErrors')
CREATE TABLE [dbo].[AnalyticsErrors] (
  [id] int IDENTITY(1,1) NOT NULL,
  [session_id] nvarchar(100) NOT NULL,
  [user_id] nvarchar(255) NOT NULL,
  [url] nvarchar(1000) NULL,
  [timestamp] datetime2 NOT NULL,
  [error_type] nvarchar(50) NOT NULL,
  [message] nvarchar(MAX) NOT NULL,
  [stack] nvarchar(MAX) NULL,
  [http_status] int NULL,
  [http_method] nvarchar(10) NULL,
  [http_url] nvarchar(1000) NULL,
  [created_at] datetime2 NOT NULL DEFAULT (getutcdate()),
  CONSTRAINT [PK_AnalyticsErrors] PRIMARY KEY ([id])
);
GO

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='dbo' AND TABLE_NAME='AnalyticsEvents')
CREATE TABLE [dbo].[AnalyticsEvents] (
  [id] int IDENTITY(1,1) NOT NULL,
  [session_id] nvarchar(100) NOT NULL,
  [user_id] nvarchar(255) NOT NULL,
  [url] nvarchar(1000) NOT NULL,
  [timestamp] datetime2 NOT NULL,
  [event_name] nvarchar(100) NOT NULL,
  [properties] nvarchar(MAX) NULL,
  [created_at] datetime2 NOT NULL DEFAULT (getutcdate()),
  CONSTRAINT [PK_AnalyticsEvents] PRIMARY KEY ([id])
);
GO

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='dbo' AND TABLE_NAME='AppConfig')
CREATE TABLE [dbo].[AppConfig] (
  [key] nvarchar(100) NOT NULL,
  [value] nvarchar(MAX) NOT NULL,
  [updated_at] datetime2 NOT NULL DEFAULT (getutcdate()),
  CONSTRAINT [PK_AppConfig] PRIMARY KEY ([key])
);
GO

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='dbo' AND TABLE_NAME='bank')
CREATE TABLE [dbo].[bank] (
  [BankID] nvarchar(50) NULL,
  [BankName] nvarchar(50) NULL,
  [RoutingNumber] nvarchar(50) NULL,
  [Notes] nvarchar(50) NULL
);
GO

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='dbo' AND TABLE_NAME='bankDeposit')
CREATE TABLE [dbo].[bankDeposit] (
  [BankDepositID] nvarchar(50) NULL,
  [PracticeBankAccountID] nvarchar(50) NULL,
  [DepositDate] date NULL,
  [PayerPaymentID] nvarchar(50) NULL,
  [DepositAmount] money NULL,
  [DepositMethod] nvarchar(50) NULL,
  [Notes] nvarchar(50) NULL,
  [PracticeID] int NULL,
  [LocationID] int NULL
);
GO

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='dbo' AND TABLE_NAME='BreachIncidents')
CREATE TABLE [dbo].[BreachIncidents] (
  [id] int IDENTITY(1,1) NOT NULL,
  [incident_type] nvarchar(50) NOT NULL,
  [description] nvarchar(MAX) NOT NULL,
  [affected_records] int NULL DEFAULT ((0)),
  [phi_involved] bit NULL DEFAULT ((0)),
  [status] nvarchar(30) NULL DEFAULT ('reported'),
  [severity] nvarchar(20) NULL DEFAULT ('medium'),
  [reported_by] nvarchar(255) NOT NULL,
  [assigned_to] nvarchar(255) NULL,
  [discovered_at] datetime2 NOT NULL,
  [contained_at] datetime2 NULL,
  [resolved_at] datetime2 NULL,
  [notification_sent] bit NULL DEFAULT ((0)),
  [notification_date] datetime2 NULL,
  [root_cause] nvarchar(MAX) NULL,
  [corrective_action] nvarchar(MAX) NULL,
  [created_at] datetime2 NULL DEFAULT (getutcdate()),
  [updated_at] datetime2 NULL DEFAULT (getutcdate()),
  CONSTRAINT [PK_BreachIncidents] PRIMARY KEY ([id])
);
GO

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='dbo' AND TABLE_NAME='BusinessAssociateAgreements')
CREATE TABLE [dbo].[BusinessAssociateAgreements] (
  [id] int IDENTITY(1,1) NOT NULL,
  [vendor_name] nvarchar(200) NOT NULL,
  [vendor_contact] nvarchar(255) NULL,
  [agreement_date] date NOT NULL,
  [expiration_date] date NULL,
  [status] nvarchar(30) NULL DEFAULT ('active'),
  [document_path] nvarchar(500) NULL,
  [notes] nvarchar(MAX) NULL,
  [created_by] nvarchar(255) NULL,
  [created_at] datetime2 NULL DEFAULT (getutcdate()),
  [updated_at] datetime2 NULL DEFAULT (getutcdate()),
  CONSTRAINT [PK_BusinessAssociateAgreements] PRIMARY KEY ([id])
);
GO

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='dbo' AND TABLE_NAME='carccodes')
CREATE TABLE [dbo].[carccodes] (
  [CARCCode] nvarchar(50) NOT NULL,
  [Description] nvarchar(100) NOT NULL,
  [Category] nvarchar(50) NOT NULL,
  [DentalRelevant] nvarchar(50) NULL,
  CONSTRAINT [PK_carccodes] PRIMARY KEY ([CARCCode])
);
GO

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='dbo' AND TABLE_NAME='CARCCombo')
CREATE TABLE [dbo].[CARCCombo] (
  [CodeID] smallint NOT NULL,
  [ReasonDenialCodeID] tinyint NOT NULL,
  [ReasonOrDenial] nvarchar(50) NOT NULL,
  [TypeID] tinyint NOT NULL,
  [TypeName] nvarchar(50) NOT NULL,
  [CARCCode] nvarchar(50) NOT NULL
);
GO

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='dbo' AND TABLE_NAME='CarcType')
CREATE TABLE [dbo].[CarcType] (
  [TypeID] tinyint NOT NULL,
  [TypeName] nvarchar(50) NOT NULL
);
GO

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='dbo' AND TABLE_NAME='Catalog')
CREATE TABLE [dbo].[Catalog] (
  [id] int IDENTITY(1,1) NOT NULL,
  [catalog_type] nvarchar(50) NOT NULL,
  [name] nvarchar(255) NOT NULL,
  [status] nvarchar(50) NULL,
  [source] nvarchar(100) NULL,
  [created_at] datetime2 NULL DEFAULT (getdate()),
  [updated_at] datetime2 NULL DEFAULT (getdate()),
  CONSTRAINT [PK_Catalog] PRIMARY KEY ([id])
);
GO

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='dbo' AND TABLE_NAME='ClaimDocuments')
CREATE TABLE [dbo].[ClaimDocuments] (
  [id] int IDENTITY(1,1) NOT NULL,
  [claim_id] nvarchar(50) NULL,
  [file_name] nvarchar(500) NULL,
  [content_type] nvarchar(100) NULL,
  [file_size] int NULL,
  [file_data] varbinary(MAX) NULL,
  [doc_type] nvarchar(50) NULL,
  [uploaded_by] nvarchar(200) NULL,
  [created_at] datetime2 NOT NULL DEFAULT (sysutcdatetime()),
  [xen_claim_num] int NULL,
  [DocNum] int NULL,
  [AttachType] nvarchar(50) NULL,
  [ToothNum] nvarchar(10) NULL,
  [FileUrl] nvarchar(1000) NULL,
  [Note] nvarchar(500) NULL,
  [PatNum] int NULL,
  CONSTRAINT [PK_ClaimDocuments] PRIMARY KEY ([id])
);
GO

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='dbo' AND TABLE_NAME='claimExternal')
CREATE TABLE [dbo].[claimExternal] (
  [ClaimExternalID] nvarchar(50) NULL,
  [ClaimID] nvarchar(50) NULL,
  [PayerID] nvarchar(50) NULL,
  [PayerClaimControlNumber] bigint NULL,
  [EdiFileAuditID] nvarchar(50) NULL
);
GO

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='dbo' AND TABLE_NAME='claimhistory')
CREATE TABLE [dbo].[claimhistory] (
  [ClaimHistoryId] nvarchar(50) NULL,
  [ServiceLineId] nvarchar(50) NULL,
  [ClaimID] nvarchar(50) NULL,
  [DateOfService] date NULL,
  [Accepted] bit NULL,
  [AuthorizationId] nvarchar(50) NULL,
  [ClaimStatus] nvarchar(50) NULL,
  [ClaimSubmittedDate] date NULL,
  [ClaimRejectedDate] date NULL,
  [InsuranceClaimSubmissionAttempt] tinyint NULL,
  [IsClaimDenied] bit NULL,
  [CarcCode] nvarchar(50) NULL,
  [AssignedTo] int NULL,
  [ClaimWorkStartedTime] datetime2 NULL,
  [ClaimWorkEndedTime] datetime2 NULL,
  [ContractualAdjustments] float NULL,
  [Progress] float NULL,
  [ClaimModifiedDate] date NULL,
  [ClaimBalanceDue] float NULL,
  [xen_claim_num] int NULL
);
GO

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='dbo' AND TABLE_NAME='claimPostHistory')
CREATE TABLE [dbo].[claimPostHistory] (
  [ClaimPostHistoryID] varchar(50) NOT NULL,
  [RemittanceFileID] varchar(20) NULL,
  [PostedFlag] varchar(20) NULL,
  [PostedBy] varchar(20) NULL,
  [PostedDate] date NULL
);
GO

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='dbo' AND TABLE_NAME='ClaimPriority')
CREATE TABLE [dbo].[ClaimPriority] (
  [ClaimID] nvarchar(50) NOT NULL,
  [priority_score] float NOT NULL DEFAULT ((0)),
  [aging_component] float NOT NULL DEFAULT ((0)),
  [value_component] float NOT NULL DEFAULT ((0)),
  [deadline_component] float NOT NULL DEFAULT ((0)),
  [workload_component] float NOT NULL DEFAULT ((0)),
  [recalculated_at] datetime2 NOT NULL DEFAULT (getutcdate()),
  CONSTRAINT [PK_ClaimPriority] PRIMARY KEY ([ClaimID])
);
GO

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='dbo' AND TABLE_NAME='claims')
CREATE TABLE [dbo].[claims] (
  [ClaimID] nvarchar(50) NULL,
  [PatientID] nvarchar(50) NULL,
  [PayerID] smallint NULL,
  [ProviderID] smallint NULL,
  [DateOfService] date NULL,
  [ChargeAmt] decimal(12, 2) NULL,
  [ClaimSubmittedDate] date NULL,
  [InsuranceClaimID] nvarchar(50) NULL,
  [ClaimGUID] uniqueidentifier NOT NULL DEFAULT (newid()),
  [customer_id] int NULL,
  [xen_claim_num] int NULL,
  [xen_patient_num] int NULL,
  [xen_plan_num] int NULL,
  [xen_status] nvarchar(1) NULL,
  [xen_ins_pay_amt] decimal(10, 2) NULL,
  [xen_claim_note] nvarchar(255) NULL,
  [DateSent] date NULL,
  [DateReceived] date NULL,
  [ClaimStatus] nvarchar(50) NULL,
  [ClaimFee] decimal(10, 2) NULL,
  [InsPayEst] decimal(10, 2) NULL,
  [InsPayAmt] decimal(10, 2) NULL,
  [DedApplied] decimal(10, 2) NULL,
  [WriteOff] decimal(10, 2) NULL,
  [PatPort] decimal(10, 2) NULL,
  [PreAuthString] nvarchar(100) NULL,
  [ClaimNote] nvarchar(MAX) NULL,
  [ReasonUnderPaid] nvarchar(200) NULL,
  [ProvTreat] int NULL,
  [ProvBill] int NULL
);
GO

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='dbo' AND TABLE_NAME='ClaimStepCompletion')
CREATE TABLE [dbo].[ClaimStepCompletion] (
  [id] int IDENTITY(1,1) NOT NULL,
  [claim_id] nvarchar(50) NOT NULL,
  [step_id] int NOT NULL,
  [user_id] nvarchar(255) NOT NULL,
  [completed_at] datetime2 NOT NULL DEFAULT (getutcdate()),
  CONSTRAINT [PK_ClaimStepCompletion] PRIMARY KEY ([id])
);
GO

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='dbo' AND TABLE_NAME='ClaimStepNote')
CREATE TABLE [dbo].[ClaimStepNote] (
  [id] int IDENTITY(1,1) NOT NULL,
  [claim_id] nvarchar(50) NOT NULL,
  [step_id] int NULL,
  [author_user_id] nvarchar(255) NOT NULL,
  [note_text] nvarchar(MAX) NOT NULL,
  [note_type] nvarchar(50) NOT NULL DEFAULT ('general'),
  [created_at] datetime2 NOT NULL DEFAULT (getutcdate()),
  CONSTRAINT [PK_ClaimStepNote] PRIMARY KEY ([id])
);
GO

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='dbo' AND TABLE_NAME='ClearinghouseConnection')
CREATE TABLE [dbo].[ClearinghouseConnection] (
  [id] int IDENTITY(1,1) NOT NULL,
  [name] nvarchar(100) NOT NULL,
  [provider] nvarchar(50) NOT NULL,
  [api_url] nvarchar(500) NULL,
  [api_key_encrypted] nvarchar(500) NULL,
  [api_secret_encrypted] nvarchar(500) NULL,
  [username] nvarchar(200) NULL,
  [is_active] bit NULL DEFAULT ((1)),
  [last_sync_at] datetime2 NULL,
  [sync_interval_minutes] int NULL DEFAULT ((60)),
  [customer_id] int NULL,
  [created_at] datetime2 NULL DEFAULT (getdate()),
  [updated_at] datetime2 NULL DEFAULT (getdate()),
  CONSTRAINT [PK_ClearinghouseConnection] PRIMARY KEY ([id])
);
GO

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='dbo' AND TABLE_NAME='ClearinghouseLog')
CREATE TABLE [dbo].[ClearinghouseLog] (
  [id] int IDENTITY(1,1) NOT NULL,
  [connection_id] int NOT NULL,
  [action] nvarchar(50) NOT NULL,
  [claim_id] nvarchar(50) NULL,
  [status] nvarchar(20) NOT NULL,
  [request_payload] nvarchar(MAX) NULL,
  [response_payload] nvarchar(MAX) NULL,
  [error_message] nvarchar(500) NULL,
  [duration_ms] int NULL,
  [created_at] datetime2 NULL DEFAULT (getdate()),
  CONSTRAINT [PK_ClearinghouseLog] PRIMARY KEY ([id])
);
GO

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='dbo' AND TABLE_NAME='CoachingRecommendation')
CREATE TABLE [dbo].[CoachingRecommendation] (
  [id] int IDENTITY(1,1) NOT NULL,
  [staff_id] int NOT NULL,
  [carc_code] nvarchar(20) NOT NULL,
  [rating] nvarchar(30) NOT NULL,
  [staff_avg_min] float NULL,
  [team_avg_min] float NULL,
  [mentor_id] int NULL,
  [mentor_name] nvarchar(100) NULL,
  [module_id] int NULL,
  [assignment_id] int NULL,
  [review_date] date NULL,
  [status] nvarchar(30) NOT NULL DEFAULT ('pending'),
  [notes] nvarchar(500) NULL,
  [created_at] datetime2 NOT NULL DEFAULT (getutcdate()),
  [resolved_at] datetime2 NULL,
  CONSTRAINT [PK_CoachingRecommendation] PRIMARY KEY ([id])
);
GO

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='dbo' AND TABLE_NAME='CommunicationsConnection')
CREATE TABLE [dbo].[CommunicationsConnection] (
  [id] int IDENTITY(1,1) NOT NULL,
  [name] nvarchar(100) NOT NULL,
  [channel] nvarchar(10) NOT NULL,
  [provider] nvarchar(50) NULL,
  [api_key_encrypted] nvarchar(500) NULL,
  [api_secret_encrypted] nvarchar(500) NULL,
  [from_address] nvarchar(200) NULL,
  [from_name] nvarchar(100) NULL,
  [is_active] bit NULL DEFAULT ((1)),
  [customer_id] int NULL,
  [created_at] datetime2 NULL DEFAULT (getdate()),
  CONSTRAINT [PK_CommunicationsConnection] PRIMARY KEY ([id])
);
GO

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='dbo' AND TABLE_NAME='contractDetails')
CREATE TABLE [dbo].[contractDetails] (
  [PayerContractID] int NULL,
  [PayerID] smallint NULL,
  [ContractNumber] nvarchar(50) NULL,
  [ContractPlanName] nvarchar(50) NULL,
  [MailedDate] date NULL,
  [ReceivedDate] date NULL,
  [DateSigned] date NULL,
  [EffectiveDate] date NULL,
  [ExpirationDate] date NULL,
  [ContractStatusID] tinyint NULL,
  [ContractTypeID] tinyint NULL,
  [PlanNumber] nvarchar(50) NULL,
  [GroupNumber] nvarchar(50) NULL,
  [PayerMixClassID] tinyint NULL,
  [Website] nvarchar(50) NULL,
  [ContractType] nvarchar(50) NULL,
  [ContractStartDate] date NULL,
  [ContractEndDate] date NULL
);
GO

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='dbo' AND TABLE_NAME='contractFeeSchedule')
CREATE TABLE [dbo].[contractFeeSchedule] (
  [FeeScheduleID] int NOT NULL,
  [PayerContractID] nvarchar(50) NOT NULL,
  [ServiceCode] nvarchar(50) NOT NULL,
  [ReimbursedAmount] float NOT NULL,
  [CPT] nvarchar(50) NOT NULL,
  [ReimbursementFlag] tinyint NOT NULL,
  [Unit] nvarchar(50) NOT NULL,
  [PriorAuthorization] bit NOT NULL,
  [EffectiveDate] date NOT NULL,
  [ExpirationDate] date NOT NULL
);
GO

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='dbo' AND TABLE_NAME='contractFeeScheduleDetail')
CREATE TABLE [dbo].[contractFeeScheduleDetail] (
  [FeeScheduleLineID] int NULL,
  [FeeScheduleID] int NULL,
  [PayerContractID] int NULL,
  [ServiceCode] nvarchar(50) NULL,
  [AllowedAmount] float NULL,
  [CPT] nvarchar(50) NULL,
  [ReimbursementFlag] tinyint NULL,
  [Unit] nvarchar(50) NULL,
  [PriorAuthorization] bit NULL,
  [EffectiveDate] date NULL,
  [ExpirationDate] date NULL
);
GO

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='dbo' AND TABLE_NAME='contractFeeScheduleHeader')
CREATE TABLE [dbo].[contractFeeScheduleHeader] (
  [FeeScheduleID] int NULL,
  [FeeScheduleKey] nvarchar(50) NULL,
  [PayerContractID] int NULL,
  [FeeScheduleName] nvarchar(50) NULL,
  [FeeScheduleType] nvarchar(50) NULL,
  [EffectiveDate] date NULL,
  [ExpirationDate] date NULL,
  [Status] nvarchar(50) NULL,
  [Source] nvarchar(50) NULL,
  [Notes] nvarchar(500) NULL
);
GO

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='dbo' AND TABLE_NAME='contractFeeScheduleStateHistory')
CREATE TABLE [dbo].[contractFeeScheduleStateHistory] (
  [FeeScheduleStateHistoryID] bigint IDENTITY(1,1) NOT NULL,
  [FeeScheduleID] int NOT NULL,
  [PayerContractID] nvarchar(50) NOT NULL,
  [StateFrom] nvarchar(50) NULL,
  [StateTo] nvarchar(50) NOT NULL,
  [IsVerified] bit NOT NULL,
  [StateChangedAt] datetime2 NOT NULL,
  [StateChangedBy] nvarchar(200) NOT NULL,
  [ChangeSource] nvarchar(50) NOT NULL,
  [Notes] nvarchar(2000) NULL,
  CONSTRAINT [PK_contractFeeScheduleStateHistory] PRIMARY KEY ([FeeScheduleStateHistoryID])
);
GO

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='dbo' AND TABLE_NAME='contractFeeScheduleType')
CREATE TABLE [dbo].[contractFeeScheduleType] (
  [FeeScheduleTypeID] int NOT NULL,
  [FeeScheduleTypeCode] nvarchar(50) NOT NULL,
  [FeeScheduleTypeName] nvarchar(200) NOT NULL,
  CONSTRAINT [PK_contractFeeScheduleType] PRIMARY KEY ([FeeScheduleTypeID])
);
GO

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='dbo' AND TABLE_NAME='contractFiling')
CREATE TABLE [dbo].[contractFiling] (
  [FilingID] int NULL,
  [PayerContractID] int NULL,
  [FederalTaxID] nvarchar(50) NULL,
  [EntityNPI] int NULL,
  [ServiceNPI] int NULL,
  [Billing] nvarchar(50) NULL,
  [OtherNPI] nvarchar(1) NULL,
  [ElectronicFiling] tinyint NULL,
  [ClaimDeadline] nvarchar(50) NULL
);
GO

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='dbo' AND TABLE_NAME='contractLeaseNetwork')
CREATE TABLE [dbo].[contractLeaseNetwork] (
  [LeaseNetworkID] tinyint NULL,
  [LeaseNetworkKey] nvarchar(50) NULL,
  [NetworkName] nvarchar(50) NULL,
  [GovernmentCommercial] nvarchar(50) NULL,
  [DirectIndirect] nvarchar(50) NULL,
  [AgreementKnown] nvarchar(50) NULL
);
GO

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='dbo' AND TABLE_NAME='contractLeaseNetworkPayer')
CREATE TABLE [dbo].[contractLeaseNetworkPayer] (
  [LeaseNetworkPayerID] tinyint NULL,
  [LeaseNetworkID] tinyint NULL,
  [PayerID] smallint NULL
);
GO

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='dbo' AND TABLE_NAME='contractLocation')
CREATE TABLE [dbo].[contractLocation] (
  [PayerContractID] int NULL,
  [LocationID] tinyint NULL
);
GO

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='dbo' AND TABLE_NAME='contractNegotiationNotes')
CREATE TABLE [dbo].[contractNegotiationNotes] (
  [NotesID] int NOT NULL,
  [PayerContractID] smallint NOT NULL,
  [Note] nvarchar(100) NOT NULL,
  [AuthorUserID] tinyint NOT NULL,
  [NoteDate] date NOT NULL
);
GO

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='dbo' AND TABLE_NAME='contractOrganization')
CREATE TABLE [dbo].[contractOrganization] (
  [LocationID] tinyint NULL,
  [LocationName] nvarchar(50) NULL,
  [OrganizationName] nvarchar(50) NULL
);
GO

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='dbo' AND TABLE_NAME='contractPayer')
CREATE TABLE [dbo].[contractPayer] (
  [PayerID] smallint NULL,
  [PayerName] nvarchar(50) NULL,
  [Website] nvarchar(50) NULL
);
GO

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='dbo' AND TABLE_NAME='contractPayerContracts')
CREATE TABLE [dbo].[contractPayerContracts] (
  [PayerContractID] int NULL,
  [PayerID] smallint NULL,
  [ContractDisplayName] nvarchar(50) NULL,
  [ActiveFlag] tinyint NULL,
  [CreatedAt] date NULL,
  [CreatedBy] nvarchar(50) NULL
);
GO

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='dbo' AND TABLE_NAME='contractPayerXwalk')
CREATE TABLE [dbo].[contractPayerXwalk] (
  [ReconPayerID] smallint NULL,
  [ContractPayerID] smallint NULL,
  [MatchMethod] nvarchar(50) NULL,
  [ActiveFlag] tinyint NULL,
  [CreatedAt] date NULL,
  [CreatedBy] nvarchar(50) NULL
);
GO

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='dbo' AND TABLE_NAME='contractProviderLocationXwalk')
CREATE TABLE [dbo].[contractProviderLocationXwalk] (
  [ReconProviderID] smallint NULL,
  [ContractLocationID] tinyint NULL,
  [MatchMethod] nvarchar(50) NULL,
  [ActiveFlag] tinyint NULL,
  [CreatedAt] date NULL,
  [CreatedBy] nvarchar(50) NULL
);
GO

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='dbo' AND TABLE_NAME='contractTerms')
CREATE TABLE [dbo].[contractTerms] (
  [TermID] int NULL,
  [PayerContractID] int NULL,
  [LocationID] tinyint NULL,
  [ApplicableFees] nvarchar(50) NULL,
  [ContractBackground] nvarchar(50) NULL,
  [Amendments] nvarchar(50) NULL,
  [AssignmentTerms] nvarchar(50) NULL,
  [ReportingRequirements] nvarchar(50) NULL
);
GO

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='dbo' AND TABLE_NAME='Customers')
CREATE TABLE [dbo].[Customers] (
  [uid] int IDENTITY(1,1) NOT NULL,
  [name] nvarchar(255) NOT NULL,
  [slug] nvarchar(100) NULL,
  [is_active] bit NOT NULL DEFAULT ((1)),
  [plan_notes] nvarchar(MAX) NULL,
  [created_by] nvarchar(255) NULL,
  [updated_by] nvarchar(255) NULL,
  [created_at] datetime2 NOT NULL DEFAULT (getutcdate()),
  [updated_at] datetime2 NOT NULL DEFAULT (getutcdate()),
  CONSTRAINT [PK_Customers] PRIMARY KEY ([uid])
);
GO

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='dbo' AND TABLE_NAME='DataAliasMapping')
CREATE TABLE [dbo].[DataAliasMapping] (
  [id] int IDENTITY(1,1) NOT NULL,
  [entity_type] nvarchar(20) NOT NULL,
  [dirty_name] nvarchar(255) NOT NULL,
  [canonical_name] nvarchar(255) NOT NULL,
  [created_by] nvarchar(255) NULL,
  [created_at] datetime2 NOT NULL DEFAULT (getutcdate()),
  CONSTRAINT [PK_DataAliasMapping] PRIMARY KEY ([id])
);
GO

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='dbo' AND TABLE_NAME='DataMaskingRule')
CREATE TABLE [dbo].[DataMaskingRule] (
  [id] int IDENTITY(1,1) NOT NULL,
  [field_name] nvarchar(100) NOT NULL,
  [display_label] nvarchar(200) NOT NULL,
  [category] nvarchar(50) NOT NULL,
  [mask_type] nvarchar(50) NOT NULL,
  [visible_above_role] int NULL DEFAULT ((3)),
  [is_active] bit NULL DEFAULT ((1)),
  [created_at] datetime2 NULL DEFAULT (getdate()),
  CONSTRAINT [PK_DataMaskingRule] PRIMARY KEY ([id])
);
GO

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='dbo' AND TABLE_NAME='EligibilityCheck')
CREATE TABLE [dbo].[EligibilityCheck] (
  [id] int IDENTITY(1,1) NOT NULL,
  [patient_id] int NULL,
  [ins_plan_id] int NULL,
  [checked_at] datetime2 NULL DEFAULT (getdate()),
  [is_eligible] bit NULL,
  [coverage_pct] decimal(5, 2) NULL,
  [annual_max] decimal(10, 2) NULL,
  [deductible] decimal(10, 2) NULL,
  [deductible_met] decimal(10, 2) NULL,
  [copay] decimal(10, 2) NULL,
  [raw_response] nvarchar(MAX) NULL,
  [checked_by] int NULL,
  CONSTRAINT [PK_EligibilityCheck] PRIMARY KEY ([id])
);
GO

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='dbo' AND TABLE_NAME='EligibilityConnection')
CREATE TABLE [dbo].[EligibilityConnection] (
  [id] int IDENTITY(1,1) NOT NULL,
  [name] nvarchar(100) NOT NULL,
  [provider] nvarchar(50) NULL,
  [api_key_encrypted] nvarchar(500) NULL,
  [api_secret_encrypted] nvarchar(500) NULL,
  [payer_id] nvarchar(50) NULL,
  [npi] nvarchar(10) NULL,
  [is_active] bit NULL DEFAULT ((1)),
  [customer_id] int NULL,
  [created_at] datetime2 NULL DEFAULT (getdate()),
  CONSTRAINT [PK_EligibilityConnection] PRIMARY KEY ([id])
);
GO

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='dbo' AND TABLE_NAME='eligibilityVerification')
CREATE TABLE [dbo].[eligibilityVerification] (
  [EligibilityCheckID] nvarchar(50) NULL,
  [ClaimID] nvarchar(50) NULL,
  [PatientID] nvarchar(50) NULL,
  [PayerID] nvarchar(50) NULL,
  [CheckDateTime] datetime2 NULL,
  [EligibilityStatus] nvarchar(50) NULL,
  [AnnualMaxRemaining] money NULL,
  [DeductibleRemaining] money NULL,
  [Notes] nvarchar(50) NULL
);
GO

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='dbo' AND TABLE_NAME='EncryptionConfig')
CREATE TABLE [dbo].[EncryptionConfig] (
  [id] int IDENTITY(1,1) NOT NULL,
  [config_key] nvarchar(100) NOT NULL,
  [config_value] nvarchar(MAX) NULL,
  [updated_at] datetime2 NULL DEFAULT (getdate()),
  CONSTRAINT [PK_EncryptionConfig] PRIMARY KEY ([id])
);
GO

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='dbo' AND TABLE_NAME='EOBERAClaim')
CREATE TABLE [dbo].[EOBERAClaim] (
  [EOBERAClaimID] nvarchar(50) NULL,
  [FileType] nvarchar(50) NULL,
  [ClaimID] nvarchar(50) NULL,
  [RemittanceClaimID] bigint NULL,
  [RemittanceFileID] nvarchar(50) NULL
);
GO

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='dbo' AND TABLE_NAME='EPrescribingConnection')
CREATE TABLE [dbo].[EPrescribingConnection] (
  [id] int IDENTITY(1,1) NOT NULL,
  [name] nvarchar(100) NOT NULL,
  [provider] nvarchar(50) NULL,
  [api_key_encrypted] nvarchar(500) NULL,
  [facility_npi] nvarchar(20) NULL,
  [is_active] bit NULL DEFAULT ((1)),
  [sandbox_mode] bit NULL DEFAULT ((1)),
  [customer_id] int NULL,
  [created_at] datetime2 NULL DEFAULT (getdate()),
  CONSTRAINT [PK_EPrescribingConnection] PRIMARY KEY ([id])
);
GO

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='dbo' AND TABLE_NAME='EPrescribingLog')
CREATE TABLE [dbo].[EPrescribingLog] (
  [id] int IDENTITY(1,1) NOT NULL,
  [rx_num] int NULL,
  [patient_id] int NULL,
  [status] nvarchar(20) NULL,
  [error_message] nvarchar(500) NULL,
  [sent_at] datetime2 NULL,
  [confirmation_num] nvarchar(100) NULL,
  [created_at] datetime2 NULL DEFAULT (getdate()),
  CONSTRAINT [PK_EPrescribingLog] PRIMARY KEY ([id])
);
GO

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='dbo' AND TABLE_NAME='EscalationChain')
CREATE TABLE [dbo].[EscalationChain] (
  [id] int IDENTITY(1,1) NOT NULL,
  [name] nvarchar(200) NOT NULL,
  [description] nvarchar(500) NULL,
  [is_active] bit NOT NULL DEFAULT ((1)),
  [created_at] datetime2 NOT NULL DEFAULT (getdate()),
  [updated_at] datetime2 NOT NULL DEFAULT (getdate()),
  CONSTRAINT [PK_EscalationChain] PRIMARY KEY ([id])
);
GO

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='dbo' AND TABLE_NAME='EscalationLevel')
CREATE TABLE [dbo].[EscalationLevel] (
  [id] int IDENTITY(1,1) NOT NULL,
  [chain_id] int NOT NULL,
  [level_order] int NOT NULL,
  [target_role] nvarchar(50) NOT NULL,
  [sla_hours] int NOT NULL DEFAULT ((48)),
  [notify_at_pct] int NOT NULL DEFAULT ((75)),
  [description] nvarchar(200) NULL,
  CONSTRAINT [PK_EscalationLevel] PRIMARY KEY ([id])
);
GO

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='dbo' AND TABLE_NAME='feeSchedule')
CREATE TABLE [dbo].[feeSchedule] (
  [FeeScheduleID] nvarchar(50) NULL,
  [PayerContractID] nvarchar(50) NULL,
  [CPT] nvarchar(50) NULL,
  [ReimbursedAmount] money NULL,
  [ReimbursementFlag] tinyint NULL,
  [Unit] nvarchar(50) NULL,
  [PriorAuthorization] bit NULL,
  [EffectiveDate] date NULL,
  [ExpirationDate] date NULL
);
GO

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='dbo' AND TABLE_NAME='feeScheduleDetail')
CREATE TABLE [dbo].[feeScheduleDetail] (
  [PayerContractID] nvarchar(50) NULL,
  [FeeScheduleTypeID] nvarchar(50) NULL,
  [CPTCode] nvarchar(50) NULL,
  [Rate] money NULL,
  [Modifier] nvarchar(1) NULL,
  [Unit] nvarchar(50) NULL,
  [EffectiveDate] date NULL,
  [TermDate] date NULL,
  [Notes] nvarchar(50) NULL,
  [IsActive] tinyint NULL,
  [UpdatedDate] date NULL
);
GO

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='dbo' AND TABLE_NAME='ifclause')
CREATE TABLE [dbo].[ifclause] (
  [IfClauseID] varchar(50) NULL,
  [IfName] varchar(50) NULL
);
GO

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='dbo' AND TABLE_NAME='KpiData')
CREATE TABLE [dbo].[KpiData] (
  [id] int IDENTITY(1,1) NOT NULL,
  [slug] nvarchar(100) NOT NULL,
  [period_date] date NOT NULL,
  [value] decimal(10, 4) NULL,
  [practice] nvarchar(100) NOT NULL DEFAULT ('All'),
  [location] nvarchar(100) NOT NULL DEFAULT ('All'),
  [created_at] datetime2 NOT NULL DEFAULT (getutcdate()),
  CONSTRAINT [PK_KpiData] PRIMARY KEY ([id])
);
GO

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='dbo' AND TABLE_NAME='LearningPath')
CREATE TABLE [dbo].[LearningPath] (
  [id] int IDENTITY(1,1) NOT NULL,
  [name] nvarchar(200) NOT NULL,
  [description] nvarchar(MAX) NULL,
  [product_slug] varchar(50) NULL,
  [estimated_minutes] int NOT NULL DEFAULT ((0)),
  [is_active] bit NOT NULL DEFAULT ((1)),
  [created_at] datetime2 NOT NULL DEFAULT (getdate()),
  [updated_at] datetime2 NOT NULL DEFAULT (getdate()),
  [allow_self_enroll] bit NOT NULL DEFAULT ((0)),
  [target_role] varchar(50) NULL,
  CONSTRAINT [PK_LearningPath] PRIMARY KEY ([id])
);
GO

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='dbo' AND TABLE_NAME='LearningPathStep')
CREATE TABLE [dbo].[LearningPathStep] (
  [id] int IDENTITY(1,1) NOT NULL,
  [learning_path_id] int NOT NULL,
  [training_module_id] int NOT NULL,
  [sort_order] int NOT NULL DEFAULT ((0)),
  [prerequisite_step_id] int NULL,
  [is_required] bit NOT NULL DEFAULT ((1)),
  CONSTRAINT [PK_LearningPathStep] PRIMARY KEY ([id])
);
GO

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='dbo' AND TABLE_NAME='leaseNetwork')
CREATE TABLE [dbo].[leaseNetwork] (
  [LeaseNetworkID] nvarchar(50) NULL,
  [NetworkName] nvarchar(50) NULL,
  [GovernmentCommercial] nvarchar(50) NULL,
  [DirectIndirect] nvarchar(50) NULL,
  [AgreementKnown] nvarchar(50) NULL
);
GO

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='dbo' AND TABLE_NAME='leaseNetworkPayer')
CREATE TABLE [dbo].[leaseNetworkPayer] (
  [LeaseNetworkPayerID] nvarchar(50) NULL,
  [LeaseNetworkID] nvarchar(50) NULL,
  [PayerID] nvarchar(50) NULL,
  [EffectiveDate] date NULL,
  [TermDate] date NULL,
  [Notes] nvarchar(50) NULL
);
GO

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='dbo' AND TABLE_NAME='location')
CREATE TABLE [dbo].[location] (
  [LocationID] int IDENTITY(1,1) NOT NULL,
  [PracticeID] int NOT NULL,
  [LocationName] varchar(100) NOT NULL,
  [FacilityNPI] varchar(10) NULL,
  [Address] varchar(200) NULL,
  [City] varchar(100) NULL,
  [State] varchar(2) NULL
);
GO

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='dbo' AND TABLE_NAME='MessageLog')
CREATE TABLE [dbo].[MessageLog] (
  [id] int IDENTITY(1,1) NOT NULL,
  [connection_id] int NULL,
  [patient_id] int NULL,
  [channel] nvarchar(10) NULL,
  [to_address] nvarchar(200) NULL,
  [subject] nvarchar(200) NULL,
  [body] nvarchar(MAX) NULL,
  [status] nvarchar(20) NULL,
  [provider_message_id] nvarchar(200) NULL,
  [error_message] nvarchar(500) NULL,
  [sent_at] datetime2 NULL,
  [created_at] datetime2 NULL DEFAULT (getdate()),
  CONSTRAINT [PK_MessageLog] PRIMARY KEY ([id])
);
GO

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='dbo' AND TABLE_NAME='MessageTemplate')
CREATE TABLE [dbo].[MessageTemplate] (
  [id] int IDENTITY(1,1) NOT NULL,
  [name] nvarchar(100) NOT NULL,
  [channel] nvarchar(10) NULL,
  [subject] nvarchar(200) NULL,
  [body] nvarchar(MAX) NULL,
  [template_type] nvarchar(50) NULL,
  [is_active] bit NULL DEFAULT ((1)),
  [customer_id] int NULL,
  [created_at] datetime2 NULL DEFAULT (getdate()),
  CONSTRAINT [PK_MessageTemplate] PRIMARY KEY ([id])
);
GO

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='dbo' AND TABLE_NAME='Notifications')
CREATE TABLE [dbo].[Notifications] (
  [id] int IDENTITY(1,1) NOT NULL,
  [user_id] int NOT NULL,
  [type] nvarchar(50) NOT NULL,
  [title] nvarchar(255) NOT NULL,
  [message] nvarchar(MAX) NULL,
  [link] nvarchar(500) NULL,
  [is_read] bit NOT NULL DEFAULT ((0)),
  [created_at] datetime2 NOT NULL DEFAULT (getdate()),
  CONSTRAINT [PK_Notifications] PRIMARY KEY ([id])
);
GO

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='dbo' AND TABLE_NAME='operators')
CREATE TABLE [dbo].[operators] (
  [OperatorID] varchar(50) NULL,
  [OperatorName] varchar(50) NULL
);
GO

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='dbo' AND TABLE_NAME='PageVisits')
CREATE TABLE [dbo].[PageVisits] (
  [id] int IDENTITY(1,1) NOT NULL,
  [session_id] nvarchar(100) NOT NULL,
  [user_email] nvarchar(255) NOT NULL,
  [product_slug] nvarchar(50) NULL,
  [page_path] nvarchar(500) NOT NULL,
  [entered_at] datetime2 NULL DEFAULT (getutcdate()),
  [exited_at] datetime2 NULL,
  [duration_seconds] int NULL,
  CONSTRAINT [PK_PageVisits] PRIMARY KEY ([id])
);
GO

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='dbo' AND TABLE_NAME='patient')
CREATE TABLE [dbo].[patient] (
  [uid] nvarchar(50) NULL,
  [FirstName] nvarchar(50) NULL,
  [LastName] nvarchar(50) NULL,
  [dob] date NULL,
  [email] nvarchar(50) NULL,
  [phone] nvarchar(50) NULL,
  [address] nvarchar(50) NULL,
  [city] nvarchar(50) NULL,
  [state] nvarchar(50) NULL,
  [SubscriberFirstName] nvarchar(50) NULL,
  [SubscriberLastName] nvarchar(50) NULL,
  [Patientssn] nvarchar(50) NULL,
  [InsurancePolicyNumber] nvarchar(50) NULL,
  [PatientID] nvarchar(50) NOT NULL,
  [PatientName] AS (ISNULL([FirstName],N'') + N' ' + ISNULL([LastName],N'')),
  [PatNum] int NULL,
  [MiddleI] nvarchar(10) NULL,
  [Preferred] nvarchar(100) NULL,
  [PatStatus] tinyint NULL DEFAULT ((0)),
  [Gender] tinyint NULL DEFAULT ((0)),
  [HmPhone] nvarchar(30) NULL,
  [WkPhone] nvarchar(30) NULL,
  [WirelessPhone] nvarchar(30) NULL,
  [PriPlanNum] int NULL DEFAULT ((0)),
  [PriProv] int NULL DEFAULT ((0)),
  [FeeSchedNum] int NULL DEFAULT ((0)),
  [EstBalance] decimal(10, 2) NULL DEFAULT ((0)),
  [BalTotal] decimal(10, 2) NULL DEFAULT ((0)),
  [PhotoPath] nvarchar(500) NULL,
  [xen_created_at] datetime2 NULL,
  [xen_updated_at] datetime2 NULL,
  [Zip] nvarchar(10) NULL,
  CONSTRAINT [PK_patient] PRIMARY KEY ([PatientID])
);
GO

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='dbo' AND TABLE_NAME='patientInsurance')
CREATE TABLE [dbo].[patientInsurance] (
  [PatientInsuranceID] nvarchar(50) NULL,
  [PatientID] nvarchar(50) NULL,
  [PayerID] nvarchar(50) NULL,
  [MemberID] nvarchar(50) NULL,
  [GroupNumber] nvarchar(50) NULL,
  [EffectiveDate] date NULL,
  [TermDate] nvarchar(1) NULL,
  [Priority] nvarchar(50) NULL
);
GO

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='dbo' AND TABLE_NAME='payer')
CREATE TABLE [dbo].[payer] (
  [PayerID] smallint NOT NULL,
  [InsuranceName] nvarchar(50) NULL,
  [PrimarySecondaryTertiary] nvarchar(50) NULL,
  [PayerStatus] nvarchar(50) NULL,
  [RenewalDate] date NULL,
  [AuthorizationEndDate] date NULL,
  [EligibilityVerified] bit NULL,
  [PatientStatus] nvarchar(50) NULL,
  [Admitted] bit NULL,
  [SatisfactionScore] tinyint NULL,
  [payer] nvarchar(50) NULL,
  [CarrierName] nvarchar(100) NOT NULL DEFAULT (''),
  [Phone] nvarchar(30) NOT NULL DEFAULT (''),
  [Address] nvarchar(200) NOT NULL DEFAULT (''),
  [City] nvarchar(100) NOT NULL DEFAULT (''),
  [State] nvarchar(2) NOT NULL DEFAULT (''),
  [Zip] nvarchar(10) NOT NULL DEFAULT (''),
  [ElectronicID] nvarchar(50) NOT NULL DEFAULT (''),
  [NpiNum] nvarchar(15) NOT NULL DEFAULT (''),
  [IsHidden] bit NOT NULL DEFAULT ((0)),
  [customer_id] INT NOT NULL DEFAULT 1,
  [created_at] datetime2 NOT NULL DEFAULT (getutcdate()),
  [updated_at] datetime2 NOT NULL DEFAULT (getutcdate()),
  CONSTRAINT [PK_payer] PRIMARY KEY ([PayerID])
);
GO

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='dbo' AND TABLE_NAME='payerBankProfile')
CREATE TABLE [dbo].[payerBankProfile] (
  [PayerBankProfileID] nvarchar(50) NULL,
  [PayerID] nvarchar(50) NULL,
  [IssuingBankID] nvarchar(50) NULL,
  [PaymentMethodDefault] nvarchar(50) NULL,
  [Notes] nvarchar(50) NULL
);
GO

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='dbo' AND TABLE_NAME='payerContracts')
CREATE TABLE [dbo].[payerContracts] (
  [PayerContractID] nvarchar(50) NULL,
  [PayerID] nvarchar(50) NULL,
  [LeaseNetworkID] nvarchar(50) NULL,
  [ContractName] nvarchar(50) NULL,
  [PlanType] nvarchar(50) NULL,
  [State] nvarchar(50) NULL,
  [EffectiveDate] date NULL,
  [ExpirationDate] date NULL,
  [Notes] nvarchar(50) NULL
);
GO

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='dbo' AND TABLE_NAME='payerPayment')
CREATE TABLE [dbo].[payerPayment] (
  [PayerPaymentID] nvarchar(50) NULL,
  [PayerID] nvarchar(50) NULL,
  [ProviderID] nvarchar(50) NULL,
  [PaymentMethod] nvarchar(50) NULL,
  [CheckNumber] int NULL,
  [EFTTraceNumber] bigint NULL,
  [IssuingBankID] nvarchar(50) NULL,
  [IssueDate] date NULL,
  [PaidDate] date NULL,
  [PayeePracticeAccountID] nvarchar(50) NULL,
  [PaymentAmount] money NULL,
  [RemittanceType] nvarchar(50) NULL,
  [RemittanceReference] nvarchar(50) NULL,
  [Status] nvarchar(50) NULL
);
GO

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='dbo' AND TABLE_NAME='payerPaymentAllocation')
CREATE TABLE [dbo].[payerPaymentAllocation] (
  [PayerPaymentAllocationID] nvarchar(50) NULL,
  [PayerPaymentID] nvarchar(50) NULL,
  [TransactionID] nvarchar(50) NULL,
  [ClaimID] nvarchar(50) NULL,
  [AmountApplied] money NULL
);
GO

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='dbo' AND TABLE_NAME='PMSConnection')
CREATE TABLE [dbo].[PMSConnection] (
  [id] int IDENTITY(1,1) NOT NULL,
  [name] nvarchar(100) NOT NULL,
  [pms_type] nvarchar(50) NOT NULL,
  [api_url] nvarchar(500) NULL,
  [api_key_encrypted] nvarchar(500) NULL,
  [api_secret_encrypted] nvarchar(500) NULL,
  [username] nvarchar(200) NULL,
  [database_path] nvarchar(500) NULL,
  [is_active] bit NULL DEFAULT ((1)),
  [sync_direction] nvarchar(20) NULL DEFAULT ('bi-directional'),
  [last_import_at] datetime2 NULL,
  [last_export_at] datetime2 NULL,
  [sync_interval_minutes] int NULL DEFAULT ((60)),
  [auto_import_claims] bit NULL DEFAULT ((1)),
  [auto_export_notes] bit NULL DEFAULT ((1)),
  [auto_export_payments] bit NULL DEFAULT ((0)),
  [customer_id] int NULL,
  [created_at] datetime2 NULL DEFAULT (getdate()),
  [updated_at] datetime2 NULL DEFAULT (getdate()),
  CONSTRAINT [PK_PMSConnection] PRIMARY KEY ([id])
);
GO

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='dbo' AND TABLE_NAME='PMSFieldMapping')
CREATE TABLE [dbo].[PMSFieldMapping] (
  [id] int IDENTITY(1,1) NOT NULL,
  [connection_id] int NOT NULL,
  [entity_type] nvarchar(50) NOT NULL,
  [pms_field] nvarchar(100) NOT NULL,
  [rcm_field] nvarchar(100) NOT NULL,
  [transform] nvarchar(200) NULL,
  [is_active] bit NULL DEFAULT ((1)),
  CONSTRAINT [PK_PMSFieldMapping] PRIMARY KEY ([id])
);
GO

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='dbo' AND TABLE_NAME='PMSSyncLog')
CREATE TABLE [dbo].[PMSSyncLog] (
  [id] int IDENTITY(1,1) NOT NULL,
  [connection_id] int NOT NULL,
  [direction] nvarchar(10) NOT NULL,
  [sync_type] nvarchar(50) NOT NULL,
  [status] nvarchar(20) NOT NULL,
  [records_processed] int NULL DEFAULT ((0)),
  [records_failed] int NULL DEFAULT ((0)),
  [error_message] nvarchar(500) NULL,
  [duration_ms] int NULL,
  [created_at] datetime2 NULL DEFAULT (getdate()),
  CONSTRAINT [PK_PMSSyncLog] PRIMARY KEY ([id])
);
GO

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='dbo' AND TABLE_NAME='practice')
CREATE TABLE [dbo].[practice] (
  [PracticeID] int IDENTITY(1,1) NOT NULL,
  [EnterpriseName] varchar(100) NOT NULL,
  [GroupName] varchar(50) NOT NULL,
  [PracticeName] varchar(100) NOT NULL
);
GO

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='dbo' AND TABLE_NAME='practiceBankAccount')
CREATE TABLE [dbo].[practiceBankAccount] (
  [PracticeBankAccountID] nvarchar(50) NULL,
  [ProviderID] nvarchar(50) NULL,
  [BankID] nvarchar(50) NULL,
  [AccountType] nvarchar(50) NULL,
  [AccountNumberMasked] nvarchar(50) NULL,
  [RoutingNumber] int NULL,
  [AccountNickname] nvarchar(50) NULL,
  [IsActive] bit NULL DEFAULT ((1))
);
GO

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='dbo' AND TABLE_NAME='Products')
CREATE TABLE [dbo].[Products] (
  [id] int IDENTITY(1,1) NOT NULL,
  [slug] nvarchar(100) NULL,
  [name] nvarchar(100) NOT NULL,
  [description] nvarchar(MAX) NULL,
  [icon] nvarchar(50) NULL,
  [nav_route] nvarchar(100) NULL,
  [nav_order] int NOT NULL DEFAULT ((99)),
  [is_active] bit NOT NULL DEFAULT ((1)),
  [created_at] datetime2 NOT NULL DEFAULT (getutcdate()),
  CONSTRAINT [PK_Products] PRIMARY KEY ([id])
);
GO

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='dbo' AND TABLE_NAME='ProductSubscriptions')
CREATE TABLE [dbo].[ProductSubscriptions] (
  [id] int IDENTITY(1,1) NOT NULL,
  [customer_id] int NOT NULL,
  [location_id] smallint NULL,
  [product_id] int NOT NULL,
  [is_active] bit NOT NULL DEFAULT ((1)),
  [activated_at] datetime2 NULL,
  [deactivated_at] datetime2 NULL,
  [activated_by] nvarchar(255) NULL,
  [deactivated_by] nvarchar(255) NULL,
  [notes] nvarchar(MAX) NULL,
  [created_at] datetime2 NOT NULL DEFAULT (getutcdate()),
  CONSTRAINT [PK_ProductSubscriptions] PRIMARY KEY ([id])
);
GO

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='dbo' AND TABLE_NAME='provider')
CREATE TABLE [dbo].[provider] (
  [ProviderID] smallint NOT NULL,
  [GroupKey] nvarchar(50) NOT NULL,
  [PossibleBillableHours] float NOT NULL,
  [HourlyRate] float NOT NULL,
  [Provider] nvarchar(50) NOT NULL,
  [Location] nvarchar(50) NOT NULL,
  [Operations] nvarchar(50) NOT NULL,
  [POD] nvarchar(50) NOT NULL,
  [MedicalDental] nvarchar(50) NOT NULL,
  [CostToCollect] float NOT NULL,
  [Segment] nvarchar(50) NOT NULL,
  [Lob] nvarchar(50) NULL,
  [Specialty] nvarchar(50) NOT NULL,
  [TaxID] nvarchar(50) NOT NULL,
  [Abbr] nvarchar(10) NOT NULL DEFAULT (''),
  [LName] nvarchar(100) NOT NULL DEFAULT (''),
  [FName] nvarchar(100) NOT NULL DEFAULT (''),
  [MI] nvarchar(10) NOT NULL DEFAULT (''),
  [Title] nvarchar(50) NOT NULL DEFAULT (''),
  [StateLicense] nvarchar(30) NOT NULL DEFAULT (''),
  [DEANum] nvarchar(30) NOT NULL DEFAULT (''),
  [IsSecondary] bit NOT NULL DEFAULT ((0)),
  [IsHidden] bit NOT NULL DEFAULT ((0)),
  [ItemOrder] smallint NOT NULL DEFAULT ((0)),
  [created_at] datetime2 NOT NULL DEFAULT (getutcdate()),
  [NPI] nvarchar(10) NULL
);
GO

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='dbo' AND TABLE_NAME='ReasonDenialCode')
CREATE TABLE [dbo].[ReasonDenialCode] (
  [ReasonDenialCodeID] tinyint NOT NULL,
  [ReasonDenialCodeName] nvarchar(50) NOT NULL,
  [ReasonOrDenial] nvarchar(50) NOT NULL,
  [Notes] nvarchar(150) NULL
);
GO

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='dbo' AND TABLE_NAME='recon_report')
CREATE TABLE [dbo].[recon_report] (
  [ClaimID] nvarchar(50) NULL,
  [DateOfService] date NULL,
  [ChargeAmt] float NULL,
  [SubscriberID] nvarchar(50) NULL,
  [ClaimSubmittedDate] date NULL,
  [PayerID] smallint NULL,
  [InsuranceName] nvarchar(50) NULL,
  [PayerStatus] nvarchar(50) NULL,
  [SatisfactionScore] tinyint NULL,
  [ProviderID] smallint NULL,
  [GroupKey] nvarchar(50) NULL,
  [PossibleBillableHours] float NULL,
  [HourlyRate] float NULL,
  [ProviderName] nvarchar(50) NULL,
  [Location] nvarchar(50) NULL,
  [Operations] nvarchar(50) NULL,
  [POD] nvarchar(50) NULL,
  [MedicalDental] nvarchar(50) NULL,
  [CostToCollect] float NULL,
  [Segment] nvarchar(50) NULL,
  [Lob] nvarchar(50) NULL,
  [Specialty] nvarchar(50) NULL,
  [TaxID] nvarchar(50) NULL,
  [NPI] bigint NULL,
  [TransactionID] nvarchar(50) NULL,
  [Quarter] tinyint NULL,
  [AdjustedCharges] float NULL,
  [PaymentPostDate] datetime2 NULL,
  [CurrentPeriodCharges] float NULL,
  [Uncollectable] float NULL,
  [TotalRCMCosts] float NULL,
  [PostingError] nvarchar(50) NULL,
  [LastPeriodCharges] float NULL,
  [RemittanceType] nvarchar(50) NULL,
  [CashTransferID] nvarchar(50) NULL,
  [CashTransferStart] datetime2 NULL,
  [CashTransferEnd] datetime2 NULL,
  [Unapplieds] float NULL,
  [PostDate] datetime2 NULL,
  [AgeBucket] nvarchar(50) NULL,
  [TrxType] nvarchar(50) NULL,
  [TrxAmt] float NULL,
  [BillingCategory] nvarchar(50) NULL,
  [PendingChgsAmt] float NULL,
  [PendingNumPat] tinyint NULL,
  [UnappliedChgsAmt] float NULL,
  [UnappliedNumPat] tinyint NULL,
  [Balance] float NULL,
  [PayerType] nvarchar(50) NULL,
  [Copay] float NULL,
  [Deductable] float NULL,
  [DepositCreated] nvarchar(1) NULL,
  [Network] nvarchar(1) NULL,
  [PatientID] nvarchar(50) NULL,
  [PatientFirstName] nvarchar(50) NULL,
  [PatientLastName] nvarchar(50) NULL,
  [SubscriberFirstName] nvarchar(50) NULL,
  [SubscriberLastName] nvarchar(50) NULL,
  [InsurancePolicyNumber] nvarchar(50) NULL,
  [dob] date NULL,
  [CARCCode] nvarchar(50) NULL,
  [ClaimDenialReason] nvarchar(100) NULL,
  [ServiceLineID] nvarchar(50) NULL,
  [ContractedRate] float NULL,
  [CPT] nvarchar(50) NULL,
  [ProcedureDescription] nvarchar(50) NULL,
  [PrimarySecondaryTertiary] nvarchar(50) NULL,
  [ClaimHistoryID] nvarchar(50) NULL,
  [Accepted] bit NULL,
  [AuthorizationID] nvarchar(50) NULL,
  [ClaimStatus] nvarchar(50) NULL,
  [ClaimRejectedDate] date NULL,
  [InsuranceClaimSubmissionAttempt] tinyint NULL,
  [IsClaimDenied] bit NULL,
  [AssignedTo] int NULL,
  [ClaimWorkStartedTime] datetime2 NULL,
  [ClaimWorkEndedTime] datetime2 NULL,
  [ContractualAdjustments] float NULL,
  [Progress] float NULL,
  [ClaimModifiedDate] date NULL,
  [ClaimBalanceDue] float NULL,
  [FirstName] nvarchar(50) NULL,
  [LastName] nvarchar(50) NULL,
  [Role] nvarchar(50) NULL,
  [ManagerName] nvarchar(50) NULL,
  [RejectedClaimID] nvarchar(50) NULL,
  [CreateDate] date NULL,
  [RuleID] varchar(50) NULL,
  [RuleName] nvarchar(50) NULL,
  [RuleType] nvarchar(50) NULL,
  [RuleDescription] nvarchar(100) NULL,
  [CreatedBy] nvarchar(50) NULL,
  [ExpirationDate] date NULL,
  [RuleActivationID] tinyint NULL,
  [RulesHistoryID] nvarchar(50) NULL,
  [ModifiedDate] date NULL,
  [ModifiedBy] nvarchar(50) NULL,
  [xen_pay_num] int NULL,
  [customer_id] int NOT NULL DEFAULT 1
);
GO

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='dbo' AND TABLE_NAME='reconciliation')
CREATE TABLE [dbo].[reconciliation] (
  [ReconciliationID] nvarchar(50) NULL,
  [RemittanceFileID] nvarchar(50) NULL,
  [BankDepositID] nvarchar(50) NULL,
  [MatchedBy] nvarchar(50) NULL,
  [CreateDate] date NULL,
  [ModifiedDate] date NULL,
  [MatchFlag] bit NULL
);
GO

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='dbo' AND TABLE_NAME='rejectedclaims')
CREATE TABLE [dbo].[rejectedclaims] (
  [RejectedClaimID] nvarchar(50) NULL,
  [ClaimID] nvarchar(50) NULL,
  [RuleID] nvarchar(50) NULL,
  [CreateDate] date NULL,
  [Status] nvarchar(20) NOT NULL DEFAULT ('Not complete'),
  [CompletedDate] datetime2 NULL,
  [CompletedBy] nvarchar(200) NULL
);
GO

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='dbo' AND TABLE_NAME='RemediationFeedback')
CREATE TABLE [dbo].[RemediationFeedback] (
  [id] int IDENTITY(1,1) NOT NULL,
  [set_id] int NOT NULL,
  [step_id] int NULL,
  [claim_id] nvarchar(50) NULL,
  [author_user_id] nvarchar(255) NOT NULL,
  [suggestion] nvarchar(MAX) NOT NULL,
  [status] nvarchar(20) NOT NULL DEFAULT ('pending'),
  [reviewed_by] nvarchar(255) NULL,
  [reviewed_at] datetime2 NULL,
  [reviewer_note] nvarchar(MAX) NULL,
  [created_at] datetime2 NOT NULL DEFAULT (getutcdate()),
  CONSTRAINT [PK_RemediationFeedback] PRIMARY KEY ([id])
);
GO

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='dbo' AND TABLE_NAME='RemediationStep')
CREATE TABLE [dbo].[RemediationStep] (
  [id] int IDENTITY(1,1) NOT NULL,
  [set_id] int NOT NULL,
  [sort_order] int NOT NULL DEFAULT ((0)),
  [title] nvarchar(200) NOT NULL,
  [body] nvarchar(MAX) NULL,
  [required] bit NOT NULL DEFAULT ((0)),
  CONSTRAINT [PK_RemediationStep] PRIMARY KEY ([id])
);
GO

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='dbo' AND TABLE_NAME='RemediationStepChecklist')
CREATE TABLE [dbo].[RemediationStepChecklist] (
  [id] int IDENTITY(1,1) NOT NULL,
  [step_id] int NOT NULL,
  [sort_order] int NOT NULL DEFAULT ((0)),
  [item_text] nvarchar(500) NOT NULL,
  CONSTRAINT [PK_RemediationStepChecklist] PRIMARY KEY ([id])
);
GO

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='dbo' AND TABLE_NAME='remediationSteps')
CREATE TABLE [dbo].[remediationSteps] (
  [UID] tinyint NULL,
  [CARCNumber] nvarchar(50) NULL,
  [StepNumber] tinyint NULL,
  [Title] nvarchar(50) NULL,
  [StepDescription] nvarchar(150) NULL
);
GO

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='dbo' AND TABLE_NAME='RemediationStepSet')
CREATE TABLE [dbo].[RemediationStepSet] (
  [id] int IDENTITY(1,1) NOT NULL,
  [reason_code] nvarchar(50) NOT NULL,
  [role] nvarchar(50) NOT NULL,
  [status] nvarchar(20) NOT NULL DEFAULT ('draft'),
  [version] int NOT NULL DEFAULT ((1)),
  [published_at] datetime2 NULL,
  [published_by] nvarchar(255) NULL,
  [updated_at] datetime2 NOT NULL DEFAULT (getutcdate()),
  [updated_by] nvarchar(255) NULL,
  [created_at] datetime2 NOT NULL DEFAULT (getutcdate()),
  [created_by] nvarchar(255) NULL,
  CONSTRAINT [PK_RemediationStepSet] PRIMARY KEY ([id])
);
GO

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='dbo' AND TABLE_NAME='RemediationStepSetHistory')
CREATE TABLE [dbo].[RemediationStepSetHistory] (
  [id] int IDENTITY(1,1) NOT NULL,
  [set_id] int NOT NULL,
  [version] int NOT NULL,
  [snapshot] nvarchar(MAX) NOT NULL,
  [changed_by] nvarchar(255) NOT NULL,
  [changed_at] datetime2 NOT NULL DEFAULT (getutcdate()),
  CONSTRAINT [PK_RemediationStepSetHistory] PRIMARY KEY ([id])
);
GO

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='dbo' AND TABLE_NAME='remittanceAdjustment')
CREATE TABLE [dbo].[remittanceAdjustment] (
  [RemitAdjustmentID] nvarchar(50) NULL,
  [RemitLineID] nvarchar(50) NULL,
  [GroupCode] nvarchar(50) NULL,
  [ReasonCode] tinyint NULL,
  [Amount] money NULL,
  [CARCComboID] nvarchar(50) NULL
);
GO

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='dbo' AND TABLE_NAME='remittanceFile')
CREATE TABLE [dbo].[remittanceFile] (
  [RemittanceFileID] nvarchar(50) NULL,
  [FileType] nvarchar(50) NULL,
  [Amount] money NULL,
  [FileDate] date NULL,
  [PracticeLocation] nvarchar(50) NULL,
  [TaxID] nvarchar(50) NULL,
  [PracticeID] int NULL,
  [LocationID] int NULL,
  [era_raw] nvarchar(MAX) NULL,
  [era_payer] nvarchar(200) NULL,
  [era_status] nvarchar(20) NULL DEFAULT ('pending'),
  [era_filename] nvarchar(200) NULL,
  [era_check_amt] decimal(10, 2) NULL,
  [era_check_date] date NULL
);
GO

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='dbo' AND TABLE_NAME='remittanceLine')
CREATE TABLE [dbo].[remittanceLine] (
  [RemitLineID] nvarchar(50) NULL,
  [ServiceLineID] nvarchar(50) NULL,
  [ClaimID] nvarchar(50) NULL,
  [PayerID] nvarchar(50) NULL,
  [PostedDate] date NULL,
  [ChargeAmt] money NULL,
  [AllowedAmt] money NULL,
  [PaidAmt] money NULL,
  [PatientRespAmt] money NULL,
  [AdjustmentAmt] money NULL,
  [CARCComboID] nvarchar(50) NULL,
  [PayerPaymentID] nvarchar(50) NULL,
  [era_remittance_file_id] int NULL,
  [era_xen_claim_num] int NULL,
  [era_pat_name] nvarchar(200) NULL,
  [era_adj_code] nvarchar(20) NULL,
  [era_line_status] nvarchar(20) NULL DEFAULT ('pending')
);
GO

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='dbo' AND TABLE_NAME='ruleactivation')
CREATE TABLE [dbo].[ruleactivation] (
  [RuleActivationID] tinyint NOT NULL,
  [ActivationName] nvarchar(50) NOT NULL
);
GO

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='dbo' AND TABLE_NAME='rulecondition')
CREATE TABLE [dbo].[rulecondition] (
  [RuleConditionID] varchar(50) NULL,
  [IFClauseID] varchar(50) NULL,
  [Field] varchar(50) NULL,
  [OperatorID] varchar(50) NULL,
  [Value] varchar(50) NULL,
  [ActionID] varchar(50) NULL,
  [Message] varchar(150) NULL,
  [RuleID] varchar(50) NULL,
  [RuleHistoryID] varchar(50) NULL
);
GO

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='dbo' AND TABLE_NAME='rules')
CREATE TABLE [dbo].[rules] (
  [RuleID] varchar(50) NOT NULL,
  [RuleName] nvarchar(200) NULL,
  [RuleType] nvarchar(50) NOT NULL,
  [Category] nvarchar(50) NOT NULL,
  [Description] nvarchar(MAX) NULL,
  [CreatedBy] nvarchar(200) NULL,
  [CreateDate] date NOT NULL,
  [ExpirationDate] date NULL,
  [ActiveFlag] bit NOT NULL,
  [MatchType] nvarchar(10) NOT NULL DEFAULT ('any'),
  [Conditions] nvarchar(MAX) NOT NULL DEFAULT ('[]'),
  [Actions] nvarchar(MAX) NOT NULL DEFAULT ('[]'),
  [Scope] nvarchar(50) NOT NULL DEFAULT ('enterprise'),
  [ScopeValues] nvarchar(MAX) NOT NULL DEFAULT ('[]')
);
GO

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='dbo' AND TABLE_NAME='ruleshistory')
CREATE TABLE [dbo].[ruleshistory] (
  [RulesHistoryID] nvarchar(50) NULL,
  [RuleID] nvarchar(50) NULL,
  [ModifiedDate] date NULL,
  [ModifiedBy] nvarchar(50) NULL,
  [LastRuleName] nvarchar(50) NULL,
  [LastRuleCategory] nvarchar(50) NULL,
  [LastRuleType] nvarchar(50) NULL,
  [RuleActivationID] tinyint NULL
);
GO

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='dbo' AND TABLE_NAME='SavedReport')
CREATE TABLE [dbo].[SavedReport] (
  [id] int IDENTITY(1,1) NOT NULL,
  [name] nvarchar(200) NOT NULL,
  [description] nvarchar(500) NULL,
  [dimensions] nvarchar(MAX) NOT NULL,
  [measures] nvarchar(MAX) NOT NULL,
  [filters] nvarchar(MAX) NULL,
  [owner_id] int NOT NULL,
  [is_shared] bit NULL DEFAULT ((0)),
  [created_at] datetime2 NULL DEFAULT (getdate()),
  [updated_at] datetime2 NULL DEFAULT (getdate()),
  CONSTRAINT [PK_SavedReport] PRIMARY KEY ([id])
);
GO

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='dbo' AND TABLE_NAME='ScheduledReports')
CREATE TABLE [dbo].[ScheduledReports] (
  [id] int IDENTITY(1,1) NOT NULL,
  [name] nvarchar(255) NOT NULL,
  [report_type] nvarchar(50) NOT NULL,
  [frequency] nvarchar(20) NOT NULL DEFAULT ('daily'),
  [recipients] nvarchar(MAX) NOT NULL,
  [is_active] bit NOT NULL DEFAULT ((1)),
  [last_run_at] datetime2 NULL,
  [next_run_at] datetime2 NULL,
  [created_by] nvarchar(255) NULL,
  [created_at] datetime2 NOT NULL DEFAULT (getdate()),
  CONSTRAINT [PK_ScheduledReports] PRIMARY KEY ([id])
);
GO

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='dbo' AND TABLE_NAME='SecurityAuditLog')
CREATE TABLE [dbo].[SecurityAuditLog] (
  [id] int IDENTITY(1,1) NOT NULL,
  [scan_type] nvarchar(20) NOT NULL DEFAULT ('DAST'),
  [scan_date] datetime2 NOT NULL DEFAULT (getutcdate()),
  [scanner] nvarchar(100) NOT NULL DEFAULT ('automated'),
  [total_checks] int NOT NULL DEFAULT ((0)),
  [passed] int NOT NULL DEFAULT ((0)),
  [failed] int NOT NULL DEFAULT ((0)),
  [score_pct] int NULL,
  [findings] nvarchar(MAX) NULL,
  [sast_findings] nvarchar(MAX) NULL,
  [performed_by] nvarchar(200) NULL,
  [notes] nvarchar(500) NULL,
  [created_at] datetime2 NOT NULL DEFAULT (getutcdate()),
  CONSTRAINT [PK_SecurityAuditLog] PRIMARY KEY ([id])
);
GO

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='dbo' AND TABLE_NAME='serviceline')
CREATE TABLE [dbo].[serviceline] (
  [ServiceLineID] nvarchar(50) NOT NULL,
  [ClaimID] nvarchar(50) NOT NULL,
  [PatientID] nvarchar(50) NOT NULL,
  [PayerID] smallint NOT NULL,
  [ProviderID] smallint NOT NULL,
  [DateOfService] date NOT NULL,
  [ContractedRate] float NOT NULL,
  [ContractualAdjustments] float NOT NULL,
  [CPT] nvarchar(50) NOT NULL,
  [ProcedureDescription] nvarchar(50) NOT NULL,
  [PrimarySecondaryTertiary] nvarchar(50) NOT NULL
);
GO

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='dbo' AND TABLE_NAME='SpecialistGoals')
CREATE TABLE [dbo].[SpecialistGoals] (
  [id] int IDENTITY(1,1) NOT NULL,
  [staff_id] int NOT NULL,
  [period] nvarchar(10) NOT NULL DEFAULT ('weekly'),
  [claims_goal] int NULL,
  [revenue_goal] float NULL,
  [first_touch_goal] float NULL,
  [avg_days_goal] float NULL,
  [set_by] int NULL,
  [created_at] datetime2 NOT NULL DEFAULT (getutcdate()),
  [updated_at] datetime2 NOT NULL DEFAULT (getutcdate()),
  CONSTRAINT [PK_SpecialistGoals] PRIMARY KEY ([id])
);
GO

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='dbo' AND TABLE_NAME='TrainingAssignment')
CREATE TABLE [dbo].[TrainingAssignment] (
  [id] int IDENTITY(1,1) NOT NULL,
  [learning_path_id] int NULL,
  [module_id] int NULL,
  [assigned_to_email] nvarchar(200) NULL,
  [assigned_to_role] varchar(50) NULL,
  [is_mandatory] bit NOT NULL DEFAULT ((1)),
  [due_date] date NULL,
  [assigned_by] nvarchar(200) NOT NULL,
  [assigned_at] datetime2 NOT NULL DEFAULT (getdate()),
  [self_enrolled] bit NOT NULL DEFAULT ((0)),
  CONSTRAINT [PK_TrainingAssignment] PRIMARY KEY ([id])
);
GO

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='dbo' AND TABLE_NAME='TrainingCertificate')
CREATE TABLE [dbo].[TrainingCertificate] (
  [id] int IDENTITY(1,1) NOT NULL,
  [user_email] nvarchar(200) NOT NULL,
  [learning_path_id] int NOT NULL,
  [issued_at] datetime2 NOT NULL DEFAULT (getdate()),
  [expires_at] datetime2 NULL,
  [certificate_uid] uniqueidentifier NOT NULL DEFAULT (newid()),
  CONSTRAINT [PK_TrainingCertificate] PRIMARY KEY ([id])
);
GO

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='dbo' AND TABLE_NAME='TrainingFaq')
CREATE TABLE [dbo].[TrainingFaq] (
  [id] int IDENTITY(1,1) NOT NULL,
  [product_slug] varchar(50) NOT NULL,
  [question] nvarchar(500) NOT NULL,
  [answer] nvarchar(MAX) NOT NULL,
  [sort_order] int NOT NULL DEFAULT ((0)),
  [is_active] bit NOT NULL DEFAULT ((1)),
  [created_at] datetime2 NOT NULL DEFAULT (getdate()),
  [updated_at] datetime2 NOT NULL DEFAULT (getdate()),
  CONSTRAINT [PK_TrainingFaq] PRIMARY KEY ([id])
);
GO

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='dbo' AND TABLE_NAME='TrainingModule')
CREATE TABLE [dbo].[TrainingModule] (
  [id] int IDENTITY(1,1) NOT NULL,
  [name] nvarchar(200) NOT NULL,
  [description] nvarchar(MAX) NULL,
  [product_slug] varchar(50) NOT NULL,
  [estimated_minutes] int NOT NULL DEFAULT ((0)),
  [is_active] bit NOT NULL DEFAULT ((1)),
  [created_at] datetime2 NOT NULL DEFAULT (getdate()),
  [updated_at] datetime2 NOT NULL DEFAULT (getdate()),
  [target_role] varchar(50) NULL,
  CONSTRAINT [PK_TrainingModule] PRIMARY KEY ([id])
);
GO

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='dbo' AND TABLE_NAME='TrainingQuiz')
CREATE TABLE [dbo].[TrainingQuiz] (
  [id] int IDENTITY(1,1) NOT NULL,
  [module_id] int NOT NULL,
  [title] nvarchar(200) NOT NULL,
  [passing_score] int NOT NULL DEFAULT ((80)),
  [max_attempts] int NOT NULL DEFAULT ((3)),
  [is_active] bit NOT NULL DEFAULT ((1)),
  [created_at] datetime2 NOT NULL DEFAULT (getdate()),
  CONSTRAINT [PK_TrainingQuiz] PRIMARY KEY ([id])
);
GO

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='dbo' AND TABLE_NAME='TrainingQuizOption')
CREATE TABLE [dbo].[TrainingQuizOption] (
  [id] int IDENTITY(1,1) NOT NULL,
  [question_id] int NOT NULL,
  [option_text] nvarchar(500) NOT NULL,
  [is_correct] bit NOT NULL DEFAULT ((0)),
  [sort_order] int NOT NULL DEFAULT ((0)),
  CONSTRAINT [PK_TrainingQuizOption] PRIMARY KEY ([id])
);
GO

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='dbo' AND TABLE_NAME='TrainingQuizQuestion')
CREATE TABLE [dbo].[TrainingQuizQuestion] (
  [id] int IDENTITY(1,1) NOT NULL,
  [quiz_id] int NOT NULL,
  [question_text] nvarchar(MAX) NOT NULL,
  [question_type] varchar(20) NOT NULL DEFAULT ('multiple_choice'),
  [sort_order] int NOT NULL DEFAULT ((0)),
  [points] int NOT NULL DEFAULT ((1)),
  CONSTRAINT [PK_TrainingQuizQuestion] PRIMARY KEY ([id])
);
GO

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='dbo' AND TABLE_NAME='TrainingRecommendation')
CREATE TABLE [dbo].[TrainingRecommendation] (
  [id] int IDENTITY(1,1) NOT NULL,
  [user_email] nvarchar(200) NOT NULL,
  [learning_path_id] int NULL,
  [module_id] int NULL,
  [trigger_type] varchar(20) NOT NULL,
  [trigger_detail] nvarchar(MAX) NULL,
  [created_at] datetime2 NOT NULL DEFAULT (getdate()),
  [dismissed_at] datetime2 NULL,
  CONSTRAINT [PK_TrainingRecommendation] PRIMARY KEY ([id])
);
GO

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='dbo' AND TABLE_NAME='TrainingRoleDefault')
CREATE TABLE [dbo].[TrainingRoleDefault] (
  [id] int IDENTITY(1,1) NOT NULL,
  [role] varchar(50) NOT NULL,
  [learning_path_id] int NOT NULL,
  [is_mandatory] bit NOT NULL DEFAULT ((1)),
  CONSTRAINT [PK_TrainingRoleDefault] PRIMARY KEY ([id])
);
GO

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='dbo' AND TABLE_NAME='TrainingTooltip')
CREATE TABLE [dbo].[TrainingTooltip] (
  [id] int IDENTITY(1,1) NOT NULL,
  [product_slug] varchar(50) NOT NULL,
  [tooltip_key] varchar(100) NOT NULL,
  [content] nvarchar(MAX) NOT NULL,
  [sort_order] int NOT NULL DEFAULT ((0)),
  [is_active] bit NOT NULL DEFAULT ((1)),
  [created_at] datetime2 NOT NULL DEFAULT (getdate()),
  [updated_at] datetime2 NOT NULL DEFAULT (getdate()),
  CONSTRAINT [PK_TrainingTooltip] PRIMARY KEY ([id])
);
GO

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='dbo' AND TABLE_NAME='TrainingVideo')
CREATE TABLE [dbo].[TrainingVideo] (
  [id] int IDENTITY(1,1) NOT NULL,
  [module_id] int NOT NULL,
  [product_slug] varchar(50) NOT NULL,
  [title] nvarchar(200) NOT NULL,
  [description] nvarchar(MAX) NULL,
  [video_url] nvarchar(500) NULL,
  [thumbnail_url] nvarchar(500) NULL,
  [duration_seconds] int NOT NULL DEFAULT ((0)),
  [sort_order] int NOT NULL DEFAULT ((0)),
  [is_active] bit NOT NULL DEFAULT ((1)),
  [created_at] datetime2 NOT NULL DEFAULT (getdate()),
  [updated_at] datetime2 NOT NULL DEFAULT (getdate()),
  [video_data] varbinary(MAX) NULL,
  [content_type] varchar(100) NULL,
  [file_name] nvarchar(255) NULL,
  [file_size] bigint NULL,
  [transcript_text] nvarchar(MAX) NULL,
  [transcript_vtt] nvarchar(MAX) NULL,
  CONSTRAINT [PK_TrainingVideo] PRIMARY KEY ([id])
);
GO

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='dbo' AND TABLE_NAME='transactions')
CREATE TABLE [dbo].[transactions] (
  [TransactionID] nvarchar(50) NULL,
  [ClaimID] nvarchar(50) NULL,
  [PayerID] smallint NULL,
  [Quarter] tinyint NULL,
  [AdjustedCharges] float NULL,
  [PaymentPostDate] datetime2 NULL,
  [CurrentPeriodCharges] float NULL,
  [Uncollectable] float NULL,
  [TotalRCMCosts] float NULL,
  [PostingError] nvarchar(50) NULL,
  [LastPeriodCharges] float NULL,
  [CPT] nvarchar(50) NULL,
  [ProcedureDescription] nvarchar(50) NULL,
  [RemittanceType] nvarchar(50) NULL,
  [CashTransferID] nvarchar(50) NULL,
  [ReasonCode] nvarchar(50) NULL,
  [CashTransferStart] datetime2 NULL,
  [CashTransferEnd] datetime2 NULL,
  [Unapplieds] float NULL,
  [ContractedRate] float NULL,
  [PostDate] datetime2 NULL,
  [AgeBucket] nvarchar(50) NULL,
  [TrxType] nvarchar(50) NULL,
  [TrxAmt] float NULL,
  [BillingCategory] nvarchar(50) NULL,
  [PendingChgsAmt] float NULL,
  [PendingNumPat] tinyint NULL,
  [UnappliedChgsAmt] float NULL,
  [UnappliedNumPat] tinyint NULL,
  [Balance] float NULL,
  [PayerType] nvarchar(50) NULL,
  [CoPayAmount] float NULL,
  [DeductableAmount] float NULL,
  [ClaimSubmittedDate] date NULL,
  [DepositCreated] nvarchar(1) NULL,
  [Network] nvarchar(1) NULL
);
GO

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='dbo' AND TABLE_NAME='UserActivity')
CREATE TABLE [dbo].[UserActivity] (
  [id] int IDENTITY(1,1) NOT NULL,
  [user_email] nvarchar(255) NOT NULL,
  [activity_type] nvarchar(50) NOT NULL,
  [claim_id] nvarchar(50) NULL,
  [started_at] datetime2 NULL DEFAULT (getutcdate()),
  [ended_at] datetime2 NULL,
  [duration_seconds] int NULL,
  CONSTRAINT [PK_UserActivity] PRIMARY KEY ([id])
);
GO

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='dbo' AND TABLE_NAME='UserModuleCompletion')
CREATE TABLE [dbo].[UserModuleCompletion] (
  [id] int IDENTITY(1,1) NOT NULL,
  [user_email] nvarchar(200) NOT NULL,
  [module_id] int NOT NULL,
  [completed_at] datetime2 NOT NULL DEFAULT (getdate()),
  [total_time_sec] int NOT NULL DEFAULT ((0)),
  [quiz_score_pct] int NULL,
  CONSTRAINT [PK_UserModuleCompletion] PRIMARY KEY ([id])
);
GO

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='dbo' AND TABLE_NAME='UserPathProgress')
CREATE TABLE [dbo].[UserPathProgress] (
  [id] int IDENTITY(1,1) NOT NULL,
  [user_email] nvarchar(200) NOT NULL,
  [learning_path_id] int NOT NULL,
  [started_at] datetime2 NOT NULL DEFAULT (getdate()),
  [completed_at] datetime2 NULL,
  [pct_complete] int NOT NULL DEFAULT ((0)),
  CONSTRAINT [PK_UserPathProgress] PRIMARY KEY ([id])
);
GO

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='dbo' AND TABLE_NAME='UserProducts')
CREATE TABLE [dbo].[UserProducts] (
  [id] int IDENTITY(1,1) NOT NULL,
  [user_id] int NOT NULL,
  [product_id] int NOT NULL,
  [is_active] bit NOT NULL DEFAULT ((1)),
  [assigned_at] datetime2 NULL DEFAULT (getutcdate()),
  [assigned_by] nvarchar(255) NULL,
  CONSTRAINT [PK_UserProducts] PRIMARY KEY ([id])
);
GO

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='dbo' AND TABLE_NAME='UserQueueScope')
CREATE TABLE [dbo].[UserQueueScope] (
  [id] int IDENTITY(1,1) NOT NULL,
  [user_id] int NOT NULL,
  [scope_type] varchar(20) NOT NULL,
  [scope_value] nvarchar(255) NOT NULL,
  [created_at] datetime2 NULL DEFAULT (sysutcdatetime()),
  CONSTRAINT [PK_UserQueueScope] PRIMARY KEY ([id])
);
GO

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='dbo' AND TABLE_NAME='UserQuizAnswer')
CREATE TABLE [dbo].[UserQuizAnswer] (
  [id] int IDENTITY(1,1) NOT NULL,
  [attempt_id] int NOT NULL,
  [question_id] int NOT NULL,
  [selected_option_id] int NULL,
  [is_correct] bit NOT NULL DEFAULT ((0)),
  CONSTRAINT [PK_UserQuizAnswer] PRIMARY KEY ([id])
);
GO

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='dbo' AND TABLE_NAME='UserQuizAttempt')
CREATE TABLE [dbo].[UserQuizAttempt] (
  [id] int IDENTITY(1,1) NOT NULL,
  [user_email] nvarchar(200) NOT NULL,
  [quiz_id] int NOT NULL,
  [score_pct] int NOT NULL,
  [passed] bit NOT NULL,
  [started_at] datetime2 NOT NULL DEFAULT (getdate()),
  [completed_at] datetime2 NULL,
  CONSTRAINT [PK_UserQuizAttempt] PRIMARY KEY ([id])
);
GO

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='dbo' AND TABLE_NAME='users')
CREATE TABLE [dbo].[users] (
  [userID] int NULL,
  [FirstName] nvarchar(50) NULL,
  [LastName] nvarchar(50) NULL,
  [Designation] nvarchar(50) NULL,
  [Location] nvarchar(50) NULL,
  [Operations] nvarchar(50) NULL,
  [Role] nvarchar(50) NULL,
  [Organization] nvarchar(50) NULL,
  [Email] nvarchar(255) NULL,
  [ManagerName] nvarchar(50) NULL,
  [disabled] bit NOT NULL DEFAULT ((0)),
  [archived] bit NOT NULL DEFAULT ((0)),
  [last_login_at] datetime NULL,
  [customer_id] int NULL,
  [show_training] bit NOT NULL DEFAULT ((0)),
  [failed_login_count] int NOT NULL DEFAULT ((0)),
  [locked_until] datetime2 NULL,
  [azure_oid] nvarchar(36) NULL
);
GO

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='dbo' AND TABLE_NAME='UserSessions')
CREATE TABLE [dbo].[UserSessions] (
  [id] int IDENTITY(1,1) NOT NULL,
  [session_id] nvarchar(100) NOT NULL,
  [user_email] nvarchar(255) NOT NULL,
  [customer_id] int NULL,
  [started_at] datetime2 NULL DEFAULT (getutcdate()),
  [last_heartbeat] datetime2 NULL DEFAULT (getutcdate()),
  [ended_at] datetime2 NULL,
  [duration_seconds] int NULL,
  [page_count] int NULL DEFAULT ((0)),
  CONSTRAINT [PK_UserSessions] PRIMARY KEY ([id])
);
GO

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='dbo' AND TABLE_NAME='UserSkills')
CREATE TABLE [dbo].[UserSkills] (
  [id] int IDENTITY(1,1) NOT NULL,
  [user_id] int NOT NULL,
  [skill_type] nvarchar(50) NOT NULL,
  [skill_value] nvarchar(100) NOT NULL,
  [proficiency] tinyint NULL DEFAULT ((1)),
  [last_assessed] datetime2 NULL DEFAULT (getutcdate()),
  [source] nvarchar(50) NULL DEFAULT ('manual'),
  CONSTRAINT [PK_UserSkills] PRIMARY KEY ([id])
);
GO

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='dbo' AND TABLE_NAME='UserVideoProgress')
CREATE TABLE [dbo].[UserVideoProgress] (
  [id] int IDENTITY(1,1) NOT NULL,
  [user_email] nvarchar(200) NOT NULL,
  [video_id] int NOT NULL,
  [progress_pct] int NOT NULL DEFAULT ((0)),
  [watch_time_sec] int NOT NULL DEFAULT ((0)),
  [completed_at] datetime2 NULL,
  [last_watched_at] datetime2 NOT NULL DEFAULT (getdate()),
  CONSTRAINT [PK_UserVideoProgress] PRIMARY KEY ([id])
);
GO

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='dbo' AND TABLE_NAME='WorkflowRules')
CREATE TABLE [dbo].[WorkflowRules] (
  [id] int IDENTITY(1,1) NOT NULL,
  [name] nvarchar(255) NOT NULL,
  [description] nvarchar(MAX) NULL,
  [match_type] nvarchar(10) NOT NULL DEFAULT ('all'),
  [conditions] nvarchar(MAX) NOT NULL DEFAULT ('[]'),
  [actions] nvarchar(MAX) NOT NULL DEFAULT ('[]'),
  [is_active] bit NOT NULL DEFAULT ((1)),
  [priority] int NOT NULL DEFAULT ((0)),
  [created_at] datetime2 NOT NULL DEFAULT (getdate()),
  [updated_at] datetime2 NOT NULL DEFAULT (getdate()),
  CONSTRAINT [PK_WorkflowRules] PRIMARY KEY ([id])
);
GO

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='dbo' AND TABLE_NAME='WorkRoutingRules')
CREATE TABLE [dbo].[WorkRoutingRules] (
  [id] int IDENTITY(1,1) NOT NULL,
  [rule_name] nvarchar(200) NOT NULL,
  [priority] int NULL DEFAULT ((100)),
  [match_criteria] nvarchar(MAX) NOT NULL,
  [assign_strategy] nvarchar(50) NOT NULL,
  [assign_target] nvarchar(255) NULL,
  [is_active] bit NULL DEFAULT ((1)),
  [created_by] nvarchar(255) NULL,
  [created_at] datetime2 NULL DEFAULT (getutcdate()),
  [updated_at] datetime2 NULL DEFAULT (getutcdate()),
  CONSTRAINT [PK_WorkRoutingRules] PRIMARY KEY ([id])
);
GO

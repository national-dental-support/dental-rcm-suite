import express from 'express';
import http from 'http'; // Import http to create a server
import path from 'path';
import fs from 'fs';
import verifyToken from './middleware/jwt';
import authRoute from './routes/auth';
import logger from './utils/logger';

/** Configurations */
import config from './config';

/**
 * Security
 */
import helmet from 'helmet';
import cors from 'cors';
import { distributedRateLimit } from './middleware/distributed-rate-limit';
import cookieParser from 'cookie-parser';

/** Notifications and Events */
import { Server as SocketIOServer } from 'socket.io';

/** Business Logic Routing */
import usersRoute from '../src/routes/users/index';
import locationAssignmentsRoute from '../src/routes/location-assignments/index';
import claimsRoute from './routes/claims-tracking/index';
import payerMixRoute from '../src/routes/analytics/payer-mix';
import medicareDashboardRoute from '../src/routes/analytics/medicare-dashboard'
import sourceDataRoute from '../src/routes/analytics/source-data';
import rcmRoute from '../src/routes/analytics/rcm';
import arRoute from '../src/routes/analytics/ar';
import lookupsRoute from './routes/analytics/lookups';
import proceduresRoute from './routes/procedures/index';
import remedyStepsRoute from '../src/routes/remedy-steps/index';
import carcCodesRoute from '../src/routes/carc-codes/index';
import practicesRoute from '../src/routes/practices/index';
import filterOptionsRoute from '../src/routes/filter-options/index';
import locationsRoute from '../src/routes/locations/index';
import practiceGroupsRoute from '../src/routes/practice-groups/index';
import providersRoute from '../src/routes/providers/index';
import payersRoute from '../src/routes/payers/index';
import ediParserRoute from '../src/routes/edi-parser';
import healthMonitorRoute from '../src/routes/health-monitor';
import reconcileRoute from '../src/routes/reconcile';
import insightFlowRoute from '../src/routes/insightflow';
import rolesRoute from '../src/routes/roles';
import claimAssignmentsRoute from '../src/routes/claim-assignments';
import kpiRoute from '../src/routes/analytics/kpi';
import analyticsEventsRoute from '../src/routes/analytics/events';
import adminLogsRoute from '../src/routes/admin/logs';
import adminThemeRoute from '../src/routes/admin/theme';
import adminExecThresholdsRoute from '../src/routes/admin/exec-thresholds';
import writeoffRoute from '../src/routes/writeoff/index';
import adminAuditLogRoute from '../src/routes/admin/audit-log';
import adminClaimAuditLogRoute from '../src/routes/admin/claim-audit-log';
import adminAccessReviewRoute from '../src/routes/admin/access-review';
import adminCatalogRoute from '../src/routes/admin/catalog';
import adminUsersRoute from '../src/routes/admin/users';
import adminRemediationRoute from '../src/routes/admin/remediation';
import adminReferenceLibraryRoute from '../src/routes/admin/reference-library';
import adminDenialCodeMappingRoute from '../src/routes/admin/denial-code-mapping';
import adminSettingsRoute from '../src/routes/admin/settings';
import adminEscalationRoute from '../src/routes/admin/escalation';
import adminSecurityAuditRoute from '../src/routes/admin/security-audit';
import adminPriorityRoute from '../src/routes/admin/priority';
import adminCoachingRoute from '../src/routes/admin/coaching';
import adminScorecardsRoute from '../src/routes/admin/scorecards';
import adminTimeTrackingRoute from '../src/routes/admin/time-tracking';
import adminSsoRoute from '../src/routes/admin/customer-sso';
import adminSecurityRoute from '../src/routes/admin/security';
import masterClaimsRoute from '../src/routes/claims/index';
import subscriptionsRoute from '../src/routes/subscriptions/index';
import reconIqClaimSummaryRoute from '../src/routes/recon-iq/claim-summary';
import claimVisionClaimSummaryRoute from '../src/routes/claim-vision/claim-summary';
import insightflowClaimContextRoute from '../src/routes/insightflow/claim-context';
import dailyDashboardRoute from '../src/routes/denial-iq/manager-view/daily-dashboard/index';
import specialistDailyDashboardRoute from '../src/routes/denial-iq/specialist-view/daily-dashboard/index';
import claimQueueRoute from '../src/routes/denial-iq/manager-view/claim-queue/index';
import specialistClaimQueueRoute from '../src/routes/denial-iq/specialist-view/claim-queue/index';
import claimDetailRoute from '../src/routes/denial-iq/claim-detail/index';
import claimVisionRoute from '../src/routes/claim-vision/index';
import payerIqDashboardRoutes from '../src/routes/payer-iq/dashboard/index';
import networkPayersRoutes from '../src/routes/payer-iq/network-payers';
import payerIqNetworkLeasesRoute from '../src/routes/payer-iq/network-leases/index';
import payerIqUnderpaymentRoute from '../src/routes/payer-iq/underpayments/index';
import payerIqStrategyRoute from '../src/routes/payer-iq/strategy/index';
import supersetSsoRoute from '../src/routes/superset-sso/index';
import supersetGuestTokenRouter from '../src/routes/superset-sso/guest-token';
import ssoValidateRouter from '../src/routes/sso/index';
import supersetLogoutRouter from "./routes/superset-sso/logout";
import reconIqDashboardRoutes from '../src/routes/recon-iq/dashboard/index';
import reconIqReconciliationRoutes from '../src/routes/recon-iq/reconciliation/index';
import reconIqEncounterResearchRoutes from '../src/routes/recon-iq/encounter-research/patients';
import reconIqEncounterResearchPatientClaimsRoutes from '../src/routes/recon-iq/encounter-research/patient-claims';
import reconIqMatchingPaymentsNoEob from '../src/routes/recon-iq/matching/payment-no-eob';
import reconIqMatchingEobNoPayment from '../src/routes/recon-iq/matching/eob-no-payment';
import reconIqMatchingApplyMatch from '../src/routes/recon-iq/matching/apply-match';
import reconIqMatchingUnmatch from '../src/routes/recon-iq/matching/unmatch';
import reconIqFullyReconciledRoutes from '../src/routes/recon-iq/fully-reconciled/fully-paid-and-reconciled';
import reconIqReconciliationReportRoutes from '../src/routes/recon-iq/reconciliation-report';
import reconIqPatientStatementsRoutes from '../src/routes/recon-iq/patient-statements';
import reconIqBulkPostRoutes from '../src/routes/recon-iq/reconciliation/bulk-post';
import reconIqBankEscalationsRoutes from '../src/routes/recon-iq/bank-escalations';
import reconIqBankAccountConnectionsRoutes from '../src/routes/recon-iq/bank-account-connections';
import reconIqAutoMatcherRoutes from '../src/routes/recon-iq/matching/auto-matcher';
import reconIqEraIngestionRoutes from '../src/routes/recon-iq/era-ingestion';
import reconIqClearinghouseConnectionsRoutes from '../src/routes/recon-iq/clearinghouse-connections';
import insightflowFinancialReportsRoute from '../src/routes/insightflow/financial-reports';
import reconIqAlertsRoutes from '../src/routes/recon-iq/alerts';
import reconIqAdminConfigRoutes from '../src/routes/recon-iq/admin-config';
import reconIqCms1500Routes from '../src/routes/recon-iq/cms1500';
import reconIqSecondaryBillingRoutes from '../src/routes/recon-iq/secondary-billing';
import pdfRoutes from '../src/routes/pdf/index';
import workflowRulesRoute from '../src/routes/denial-iq/workflow-rules';
import payerIntelligenceRoute from '../src/routes/denial-iq/payer-intelligence';
import appealsRoute from '../src/routes/denial-iq/appeals';
import pendingConfigRoute from '../src/routes/denial-iq/pending-config';
import denialEventsRoute from '../src/routes/denial-iq/denial-events';
import qaWorkflowRoute from '../src/routes/denial-iq/qa-workflow';
import orgHierarchyRoute from '../src/routes/denial-iq/org-hierarchy';
import slaConfigRoute from '../src/routes/denial-iq/sla-config';
import dataQualityRoute from '../src/routes/denial-iq/data-quality';
import escalationPathsRoute from '../src/routes/denial-iq/escalation-paths';
import denialIqGroupsRoute from '../src/routes/denial-iq/admin/groups';
import complianceCheckerRoute from '../src/routes/denial-iq/compliance-checker';
import patientAdvocacyRoute from '../src/routes/denial-iq/patient-advocacy';
import scheduledReportsRoute from '../src/routes/insightflow/scheduled-reports';
import reportBuilderRoute from '../src/routes/insightflow/report-builder';
import notificationsRoute from '../src/routes/notifications/index';
import { initWebSockets } from './websockets/index';
import clearinghouseRoute from '../src/routes/integrations/clearinghouse';
import pmsRoute from '../src/routes/integrations/pms';
import eligibilityRoute from '../src/routes/integrations/eligibility';
import eprescribingRoute from '../src/routes/integrations/eprescribing';
import communicationsRoute from '../src/routes/integrations/communications';
import benchmarkingRoute from '../src/routes/insightflow/benchmarking';
import treatmentAcceptanceRoute from '../src/routes/insightflow/treatment-acceptance';
import patientLtvRoute from '../src/routes/insightflow/patient-ltv';
import badDebtRoute from '../src/routes/insightflow/bad-debt';
import cycleTimeRoute from '../src/routes/insightflow/cycle-time';
import preauthAnalyticsRoute from '../src/routes/insightflow/preauth-analytics';
import reactivationRoute from '../src/routes/insightflow/reactivation';
import claimsAnalyticsRoute from '../src/routes/insightflow/claims-analytics';
import billingOptimizationRoute from '../src/routes/insightflow/billing-optimization';
import claimAutoSubmissionRoute from '../src/routes/insightflow/claim-auto-submission';
import denialPredictionRoute from '../src/routes/insightflow/denial-prediction';
import cleanClaimRoute from '../src/routes/insightflow/clean-claim';
import imageVerificationRoute from '../src/routes/insightflow/image-verification';
import appealSuccessRoute from '../src/routes/insightflow/appeal-success';
import cptDenialRoute from '../src/routes/insightflow/cpt-denial';
import dashboardLayoutsRoute from '../src/routes/insightflow/dashboard-layouts';

import { claimMutationAudit, mutationAudit } from '../src/middleware/claim-mutation-audit';

// AI Gap-Closure Features
import claimApprovalRoute from '../src/routes/denial-iq/claim-approval';
import narrativeScoreRoute from '../src/routes/denial-iq/narrative-score';
import claimRewriteRoute from '../src/routes/denial-iq/claim-rewrite';
import resubmissionPackageRoute from '../src/routes/denial-iq/resubmission-package';
import templatePerformanceRoute from '../src/routes/denial-iq/template-performance';
import webhooksRoute from '../src/routes/api/webhooks';
import adminComplianceRoute from '../src/routes/admin/compliance';
import breachRoute from '../src/routes/admin/breach';
import { requireSubscription } from './middleware/require-subscription';
import { dataMaskingMiddleware } from './middleware/data-masking';
import { safeErrorHandler } from './middleware/safe-error';
import { hipaaAccessLog } from './middleware/hipaa-access-log';
import { sessionTimeout } from './middleware/session-timeout';
import { resolveActor } from './middleware/resolve-actor';
import { tenantContextMiddleware } from './modules/rls-context';
import { expandFilterAliases } from './middleware/expand-filter-aliases';
import sessionAnalyticsRoute from '../src/routes/analytics/sessions';

/** Org Hierarchy Routes */
import adminOrgRoute from '../src/routes/admin/org';
import adminLocationMappingsRoute from '../src/routes/admin/location-mappings';
import adminProviderGoalsRoute from '../src/routes/admin/provider-goals';
import groupsRoute from '../src/routes/groups/index';


/** Patient Portal Routes */

// Infrastructure monitoring is not part of this suite.

/** Patient Kiosk */

/** Customer Specific Routes */


const app = express();
const server = http.createServer(app);
initWebSockets(server);
const corsOptions = {
  origin: config.corsOrigin,
  credentials: true,
  allowedHeaders: ['Origin', 'X-Requested-With', 'Content-Type', 'Accept', 'Authorization', 'apikey', 'x-actor-email', 'x-actor-oid', 'x-correlation-id'],
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
};
// [ok] Route-specific raw capture for Marker webhook (captures bytes for ANY content-type)
app.post(
  "/api/integrations/marker/webhook",
  express.raw({ type: "*/*" }),
);
// Distributed rate limiter - shared across all container instances via Redis.
// Falls back to per-instance in-memory when REDIS_URL is not configured.
const limiter = distributedRateLimit({
  windowSec: 15 * 60,  // 900 s = 15 minutes
  max: 1000,
  prefix: 'rl:api:',
  message: 'Too many requests, please try again later',
});

app.use(limiter);

// Enhanced security middleware (OWASP A05)
import { applySecurityMiddleware } from './middleware/security-headers';
applySecurityMiddleware(app);
app.use(cors(corsOptions));

// Distributed tracing - assign/propagate correlation ID on every request
import { correlationId } from './utils/correlation-id';
app.use(correlationId);

const chalk = require('chalk');

app.use((req, res, next) => {
  const actor = req.headers['x-actor-email'] as string | undefined;
  const start = Date.now();
  res.on('finish', () => {
    const ms = Date.now() - start;
    const status = res.statusCode;
    const color = status >= 500 ? chalk.red : status >= 400 ? chalk.yellow : chalk.green;
    console.log(
      color(`[${new Date().toISOString()}] ${req.method} ${req.url} ${status} ${ms}ms${actor ? ` - ${actor}` : ''}`),
    );
  });
  next();
});

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

app.use(express.json({
  verify: (req: any, _res, buf) => {
    req.rawBody = buf; // Buffer
  }
}));


// Data masking - attaches req.maskData() / req.maskRecord() based on user role
app.use(dataMaskingMiddleware);

// SSO validation - public endpoint, must be registered BEFORE JWT middleware
// so SsoLandingComponent can call it without an Azure AD token
app.use('/api/sso', ssoValidateRouter);

// HIPAA audit trail - log access to patient-facing routes (Sec.164.312(b))
// Every route that can project patient-level data carries a HIPAA access log.
// recon-iq, payer-iq, insightflow and claim-vision were missing from this list
// upstream even though all four read patient data.
const hipaaRoutes = [
  '/api/claims', '/api/denial-iq', '/api/recon-iq', '/api/payer-iq',
  '/api/insightflow', '/api/claim-vision', '/api/pdf', '/api/edi-parser',
];
hipaaRoutes.forEach(prefix => app.use(prefix, hipaaAccessLog()));


// Sign-in sits in front of the token gate: you cannot present a token until you
// have one. It is the only unauthenticated write endpoint in the API.
app.use('/api/auth', authRoute);

/** Endpoints reachable without a session. Kept deliberately short. */
function isPublicPath(path: string): boolean {
  return path === '/health-monitor' || path.startsWith('/health-monitor/');
}

// Token verification. There is no bypass: the local credential login replaces
// the development shortcut this file used to carry, which trusted a
// caller-supplied email header and would have let anyone act as any user.
app.use('/api', (req, res, next) => {
  if (isPublicPath(req.path)) return next();
  verifyToken(req as any, res, next);
});

// Session timeout - HIPAA automatic logoff (Sec.164.312(a)(2)(iii))
// Runs after verifyToken so req.user.iat is available for fresh-login detection.
app.use('/api', (req, res, next) => {
  if (isPublicPath(req.path)) return next();
  sessionTimeout()(req, res, next);
});

// Global actor resolution - populates req.actor (customer_id, role, etc.) on every /api request.
// Guarantees tenant isolation across all routes without per-route wiring.
app.use('/api', resolveActor);
// Bind the request's tenant onto AsyncLocalStorage so the RLS-wrapped pool sets
// SESSION_CONTEXT('customer_id') on every query batch (DB-enforced tenant isolation,
// fail-closed). Complements the app-level tenant filter; requires a non-owner DB login
// to enforce (bypassed while connecting as db_owner - no regression).
app.use('/api', tenantContextMiddleware);
app.use('/api', expandFilterAliases);

// Superset - requires valid API key
app.use('/api/superset', supersetSsoRoute);
app.use("/api/superset", supersetLogoutRouter);

// Superset guest token - no API key needed (proxied from frontend SDK)
app.use('/superToken', supersetGuestTokenRouter);

// ANALYTICS
app.use('/api/analytics/payer-mix', payerMixRoute);
app.use('/api/analytics/source-data', sourceDataRoute);
app.use('/api/analytics/rcm', rcmRoute);
app.use('/api/analytics/ar', arRoute);
app.use('/api/analytics/kpis', requireSubscription('insightflow'), kpiRoute);
app.use('/api/analytics/medicare-dashboard', medicareDashboardRoute);
app.use('/api/analytics/lookups', lookupsRoute);
app.use('/api/analytics/events', analyticsEventsRoute);
app.use('/api/analytics/sessions', sessionAnalyticsRoute);
app.use('/api/admin/logs', adminLogsRoute);
app.use('/api/admin/theme', adminThemeRoute);
app.use('/api/admin/exec-thresholds', adminExecThresholdsRoute);
app.use('/api/writeoff', writeoffRoute);
app.use('/api/admin/audit-log', adminAuditLogRoute);
app.use('/api/admin/claim-audit-log', adminClaimAuditLogRoute);
app.use('/api/admin/access-review', adminAccessReviewRoute);
app.use('/api/admin/catalog', adminCatalogRoute);
app.use('/api/admin/users', adminUsersRoute);
app.use('/api/admin/remediation', adminRemediationRoute);
app.use('/api/admin/reference-library', adminReferenceLibraryRoute);
app.use('/api/admin/denial-code-mapping', adminDenialCodeMappingRoute);
app.use('/api/admin/settings', adminSettingsRoute);
app.use('/api/admin/escalation', adminEscalationRoute);
app.use('/api/admin/security-audit', adminSecurityAuditRoute);
app.use('/api/admin/priority', adminPriorityRoute);
app.use('/api/admin/coaching', adminCoachingRoute);
app.use('/api/admin/scorecards', adminScorecardsRoute);
app.use('/api/admin/time-tracking', adminTimeTrackingRoute);
app.use('/api/admin/sso', adminSsoRoute);
app.use('/api/admin/security', adminSecurityRoute);
app.use('/api/admin/org', adminOrgRoute);
app.use('/api/admin/location-mappings', adminLocationMappingsRoute);
app.use('/api/admin/provider-goals', adminProviderGoalsRoute);
app.use('/api/subscriptions', subscriptionsRoute);

// Global (no subscription needed)
app.use('/api/groups', groupsRoute);

// DATA BY DOMAIN
app.use('/api/locations', locationsRoute);
app.use('/api/practice-groups', practiceGroupsRoute);
app.use('/api/providers', providersRoute);
app.use('/api/payers', payersRoute);

// GENERAL ROUTIING
app.get('/api', async (_req, res) => {
  res.send({ message: 'Welcome to the api' });
});
app.use('/api/location-assignments', locationAssignmentsRoute);
app.use('/api/users', usersRoute);
app.use('/api/claims', limiter, claimsRoute);
app.use('/api/claims', masterClaimsRoute);   // GET /:id - must be after legacy claims-tracking
app.use('/api/procedures', limiter, proceduresRoute);
app.use('/api/remedy-steps', remedyStepsRoute);
app.use('/api/carc-codes', carcCodesRoute);
app.use('/api/practices', practicesRoute);
app.use('/api/filter-options', filterOptionsRoute);
app.use('/api/edi-parser', ediParserRoute);
app.use('/api/health-monitor', healthMonitorRoute); // public ping - no auth needed

// App registry - returns sibling app links (driven by SIBLING_APPS env var)
// Requires a valid JWT (enforced by the JWT middleware above via the skip-list removal)
app.get('/api/app-registry', (req: any, res) => {
  // Endpoint is now covered by JWT middleware - the skip-list exemptions below were removed
  try {
    const raw = process.env.SIBLING_APPS || '[]';
    res.json(JSON.parse(raw));
  } catch (err) {
    logger.warn('[AppRegistry] SIBLING_APPS env var is not valid JSON \u2014 returning empty list', { error: String(err) });
    res.json([]);
  }
});
app.use('/api/reconcile', reconcileRoute);
app.use('/api/insightflow', requireSubscription('insightflow'), insightFlowRoute);
app.use('/api/roles', rolesRoute);
app.use('/api/claim-assignments', claimAssignmentsRoute);

// MUTATION AUDIT - covers all mutating requests (POST/PUT/PATCH/DELETE) across every platform
// denial-iq uses the detailed ACTION_MAP variant; other platforms use the generic factory
app.use('/api/denial-iq',   claimMutationAudit);
app.use('/api/insightflow', mutationAudit('insightflow'));
app.use('/api/payer-iq',    mutationAudit('payer-iq'));
app.use('/api/recon-iq',    mutationAudit('recon-iq'));
app.use('/api/claim-vision', mutationAudit('claim-vision'));

// DENIAL IQ - subscription-gated
app.use('/api/denial-iq/manager-view/daily-dashboard', requireSubscription('denial-iq'), dailyDashboardRoute);
app.use('/api/denial-iq/specialist-view/daily-dashboard', requireSubscription('denial-iq'), specialistDailyDashboardRoute);
app.use('/api/denial-iq/manager-view/claim-queue', requireSubscription('denial-iq'), claimQueueRoute);
app.use('/api/denial-iq/specialist-view/claim-queue', requireSubscription('denial-iq'), specialistClaimQueueRoute);
app.use('/api/denial-iq/claim-detail', requireSubscription('denial-iq'), claimDetailRoute);
app.use('/api/denial-iq/workflow-rules', requireSubscription('denial-iq'), workflowRulesRoute);
app.use('/api/denial-iq/payer-intelligence', requireSubscription('denial-iq'), payerIntelligenceRoute);
app.use('/api/denial-iq/appeals', requireSubscription('denial-iq'), appealsRoute);
app.use('/api/denial-iq/pending-config', requireSubscription('denial-iq'), pendingConfigRoute);
app.use('/api/denial-iq/denial-events', requireSubscription('denial-iq'), denialEventsRoute);
app.use('/api/denial-iq/qa', requireSubscription('denial-iq'), qaWorkflowRoute);
app.use('/api/denial-iq/org-hierarchy', requireSubscription('denial-iq'), orgHierarchyRoute);
app.use('/api/denial-iq/sla', requireSubscription('denial-iq'), slaConfigRoute);
app.use('/api/denial-iq/data-quality', requireSubscription('denial-iq'), dataQualityRoute);
app.use('/api/denial-iq/escalation-paths', requireSubscription('denial-iq'), escalationPathsRoute);
app.use('/api/denial-iq/admin/groups', requireSubscription('denial-iq'), denialIqGroupsRoute);
app.use('/api/denial-iq/compliance-checker', requireSubscription('denial-iq'), complianceCheckerRoute);
app.use('/api/denial-iq/patient-advocacy', requireSubscription('denial-iq'), patientAdvocacyRoute);

// AI Gap-Closure Features - Denial IQ
app.use('/api/denial-iq/approvals', requireSubscription('denial-iq'), claimApprovalRoute);
app.use('/api/denial-iq/narrative-score', requireSubscription('denial-iq'), narrativeScoreRoute);
app.use('/api/denial-iq/claim-rewrite', requireSubscription('denial-iq'), claimRewriteRoute);
app.use('/api/denial-iq/resubmission-package', requireSubscription('denial-iq'), resubmissionPackageRoute);
app.use('/api/denial-iq/template-performance', requireSubscription('denial-iq'), templatePerformanceRoute);

// AI Gap-Closure Features - AI/ML

// CLAIM VISION - subscription-gated
app.use('/api/claim-vision', requireSubscription('claim-vision'), claimVisionRoute);

// PAYER IQ - subscription-gated
app.use('/api/payer-iq/dashboard', requireSubscription('payer-iq'), payerIqDashboardRoutes);
app.use('/api/payer-iq/network-payers', requireSubscription('payer-iq'), networkPayersRoutes);
app.use('/api/payer-iq/network-leases', requireSubscription('payer-iq'), payerIqNetworkLeasesRoute);
app.use('/api/payer-iq/underpayments', requireSubscription('payer-iq'), payerIqUnderpaymentRoute);
app.use('/api/payer-iq/strategy', requireSubscription('payer-iq'), payerIqStrategyRoute);

// ELIGIBILITY IQ

// SUBMISSION IQ

// CHARGE IQ

// PATIENT IQ

// FINANCE IQ


// PATIENT PORTAL - patient-role users only (requireRole enforced inside router)

// PATIENT KIOSK - check-in/check-out self-service

// RECON IQ - subscription-gated
app.use('/api/recon-iq/dashboard', requireSubscription('recon-iq'), reconIqDashboardRoutes);
app.use('/api/recon-iq/reconciliation', requireSubscription('recon-iq'), reconIqReconciliationRoutes);
app.use('/api/recon-iq/matching', requireSubscription('recon-iq'), reconIqMatchingPaymentsNoEob);
app.use('/api/recon-iq/matching', requireSubscription('recon-iq'), reconIqMatchingEobNoPayment);
app.use('/api/recon-iq/matching', requireSubscription('recon-iq'), reconIqMatchingApplyMatch);
app.use('/api/recon-iq/matching', requireSubscription('recon-iq'), reconIqMatchingUnmatch);
app.use('/api/recon-iq/fully-reconciled', requireSubscription('recon-iq'), reconIqFullyReconciledRoutes);
app.use('/api/recon-iq/reconciliation-report', requireSubscription('recon-iq'), reconIqReconciliationReportRoutes);
app.use('/api/recon-iq/encounter-research', requireSubscription('recon-iq'), reconIqEncounterResearchRoutes);
app.use('/api/recon-iq/encounter-research', requireSubscription('recon-iq'), reconIqEncounterResearchPatientClaimsRoutes);

// PDF endpoints (top-level)
app.use('/api/pdf', pdfRoutes);

// Claim enrichment summaries (used by DenialIQ enrichment panels - gated by source product)
app.use('/api/recon-iq/patient-statements', requireSubscription('recon-iq'), reconIqPatientStatementsRoutes);
app.use('/api/recon-iq/reconciliation', requireSubscription('recon-iq'), reconIqBulkPostRoutes);
app.use('/api/recon-iq/bank-escalations',        requireSubscription('recon-iq'), reconIqBankEscalationsRoutes);
app.use('/api/recon-iq/bank-account-connections', requireSubscription('recon-iq'), reconIqBankAccountConnectionsRoutes);
app.use('/api/recon-iq/matching',         requireSubscription('recon-iq'), reconIqAutoMatcherRoutes);
app.use('/api/recon-iq/era-ingestion',            requireSubscription('recon-iq'), reconIqEraIngestionRoutes);
app.use('/api/recon-iq/clearinghouse-connections', requireSubscription('recon-iq'), reconIqClearinghouseConnectionsRoutes);
app.use('/api/recon-iq/alerts',          requireSubscription('recon-iq'), reconIqAlertsRoutes);
app.use('/api/recon-iq/admin/config',    requireSubscription('recon-iq'), reconIqAdminConfigRoutes);
app.use('/api/recon-iq/claim-summary', requireSubscription('recon-iq'), reconIqClaimSummaryRoute);
app.use('/api/recon-iq/claims',           requireSubscription('recon-iq'), reconIqCms1500Routes);
app.use('/api/recon-iq/secondary-billing', requireSubscription('recon-iq'), reconIqSecondaryBillingRoutes);
app.use('/api/claim-vision/claim-summary', requireSubscription('claim-vision'), claimVisionClaimSummaryRoute);
app.use('/api/insightflow/claim-context', requireSubscription('insightflow'), insightflowClaimContextRoute);
// Financial reports - InsightFlow
app.use('/api/insightflow/reports', requireSubscription('insightflow'), insightflowFinancialReportsRoute);

// INSIGHTFLOW - subscription-gated
app.use('/api/insightflow/scheduled-reports', requireSubscription('insightflow'), scheduledReportsRoute);
app.use('/api/insightflow/report-builder', requireSubscription('insightflow'), reportBuilderRoute);

// Training LMS

// Notifications
app.use('/api/notifications', notificationsRoute);

// Integrations
app.use('/api/integrations/clearinghouse', clearinghouseRoute);
app.use('/api/integrations/pms', pmsRoute);
app.use('/api/integrations/eligibility', eligibilityRoute);
app.use('/api/integrations/eprescribing', eprescribingRoute);
app.use('/api/integrations/communications', communicationsRoute);

// AI / ML

// Automation

// Workforce

// LMS extensions

// InsightFlow extensions
app.use('/api/insightflow/benchmarking', requireSubscription('insightflow'), benchmarkingRoute);
app.use('/api/insightflow/treatment-acceptance', requireSubscription('insightflow'), treatmentAcceptanceRoute);
app.use('/api/insightflow/patient-ltv', requireSubscription('insightflow'), patientLtvRoute);
app.use('/api/insightflow/bad-debt', requireSubscription('insightflow'), badDebtRoute);
app.use('/api/insightflow/cycle-time', requireSubscription('insightflow'), cycleTimeRoute);
app.use('/api/insightflow/preauth-analytics', requireSubscription('insightflow'), preauthAnalyticsRoute);
app.use('/api/insightflow/reactivation', requireSubscription('insightflow'), reactivationRoute);
app.use('/api/insightflow/claims-analytics', requireSubscription('insightflow'), claimsAnalyticsRoute);
app.use('/api/insightflow/billing-optimization', requireSubscription('insightflow'), billingOptimizationRoute);
app.use('/api/insightflow/claim-auto-submission', requireSubscription('insightflow'), claimAutoSubmissionRoute);
app.use('/api/insightflow/denial-prediction', requireSubscription('insightflow'), denialPredictionRoute);
app.use('/api/insightflow/clean-claim', requireSubscription('insightflow'), cleanClaimRoute);
app.use('/api/insightflow/image-verification', requireSubscription('insightflow'), imageVerificationRoute);
app.use('/api/insightflow/appeal-success',    requireSubscription('insightflow'), appealSuccessRoute);
app.use('/api/insightflow/cpt-denial',       requireSubscription('insightflow'), cptDenialRoute);
app.use('/api/insightflow/my/dashboard-layouts', requireSubscription('insightflow'), dashboardLayoutsRoute);

// Collaboration

// Public API / Webhooks
app.use('/api/webhooks', webhooksRoute);

// Admin - Compliance
app.use('/api/admin/compliance', adminComplianceRoute);

// Admin - Breach & BAA
app.use('/api/admin/breach', breachRoute);

// Infrastructure monitoring routes are not part of this suite.

// -- Serve Angular frontend in deployed (App Service) mode --------------------
const publicDir = path.join(__dirname, '..', 'public');
if (process.env.SERVE_STATIC === 'true' && fs.existsSync(path.join(publicDir, 'index.html'))) {
  app.use(express.static(publicDir));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(publicDir, 'index.html'));
  });
}

// Tenant-scoped storage endpoints

// Global error handler - strips internal details from 500 responses (must be last)
app.use(safeErrorHandler);

export default server;

/**
 * Pure risk-score calculator - no DB calls, fully testable.
 * Takes the latest heartbeat fields + device status and returns 0-100 scores per category.
 */

export interface ExtendedHeartbeat {
  // Core
  cpu_pct?: number | null;
  memory_pct?: number | null;
  disk_pct?: number | null;
  config_compliant?: boolean | number | null;
  // Security
  av_status?: string | null;           // active | inactive | not_installed | unknown
  bitlocker_status?: string | null;    // enabled | disabled | unknown
  patch_count_pending?: number | null;
  screen_lock_enabled?: boolean | number | null;
  firewall_enabled?: boolean | number | null;
  // Dental / backup
  db_connectivity_ok?: boolean | number | null;
  backup_ok?: boolean | number | null;
  last_backup_age_hours?: number | null;
  pms_process_status?: string | null;  // running | stopped | not_found | unknown
  // Network
  internet_ok?: boolean | number | null;
  gateway_reachable?: boolean | number | null;
  network_latency_ms?: number | null;
  dns_ok?: boolean | number | null;
  // HIPAA
  hipaa_issues?: string | string[] | null;  // JSON string or array
  hipaa_compliant?: boolean | number | null;
}

export interface RiskScoreResult {
  availability_score:     number;  // 0-100
  security_score:         number;
  compliance_score:       number;
  data_protection_score:  number;
  connectivity_score:     number;
  overall_score:          number;  // weighted average
}

function boolVal(v: boolean | number | null | undefined): boolean | null {
  if (v === null || v === undefined) return null;
  return v === true || v === 1;
}

function clamp(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n * 10) / 10));
}

export function calculateDeviceRiskScore(
  hb: ExtendedHeartbeat,
  deviceStatus: string   // 'online' | 'degraded' | 'offline'
): RiskScoreResult {

  // -- Availability (weight 0.20) --------------------------------------------
  let availability = 100;
  if (deviceStatus === 'offline')  availability = 0;
  else if (deviceStatus === 'degraded') availability = 50;

  // -- Security (weight 0.25) ------------------------------------------------
  let security = 100;
  const avStatus = (hb.av_status || '').toLowerCase();
  if (avStatus === 'inactive')      security -= 30;
  if (avStatus === 'not_installed') security -= 30;
  const blStatus = (hb.bitlocker_status || '').toLowerCase();
  if (blStatus === 'disabled')      security -= 25;
  if (boolVal(hb.screen_lock_enabled) === false) security -= 15;
  if (boolVal(hb.firewall_enabled) === false)    security -= 20;
  const patches = hb.patch_count_pending ?? 0;
  if (patches > 20)      security -= 20;
  else if (patches > 10) security -= 10;

  // -- Compliance (weight 0.20) ----------------------------------------------
  let compliance = 100;
  if (boolVal(hb.config_compliant) === false) compliance -= 20;
  let hipaaIssues: string[] = [];
  try {
    if (Array.isArray(hb.hipaa_issues)) hipaaIssues = hb.hipaa_issues;
    else if (typeof hb.hipaa_issues === 'string') hipaaIssues = JSON.parse(hb.hipaa_issues);
  } catch {}
  compliance -= Math.min(hipaaIssues.length * 10, 60);

  // -- Data Protection (weight 0.20) -----------------------------------------
  let dataProtection = 100;
  if (boolVal(hb.backup_ok) === false)          dataProtection -= 50;
  const backupAge = hb.last_backup_age_hours ?? 0;
  if (backupAge > 25)                           dataProtection -= 30;
  if (boolVal(hb.db_connectivity_ok) === false) dataProtection -= 20;

  // -- Connectivity (weight 0.15) --------------------------------------------
  let connectivity = 100;
  if (boolVal(hb.internet_ok) === false)        connectivity -= 40;
  if (boolVal(hb.gateway_reachable) === false)  connectivity -= 30;
  if (boolVal(hb.dns_ok) === false)             connectivity -= 15;
  const latency = hb.network_latency_ms ?? 0;
  if (latency > 500)                            connectivity -= 15;
  else if (latency > 250)                       connectivity -= 5;

  // -- Weighted overall ------------------------------------------------------
  const overall =
    clamp(availability)    * 0.20 +
    clamp(security)        * 0.25 +
    clamp(compliance)      * 0.20 +
    clamp(dataProtection)  * 0.20 +
    clamp(connectivity)    * 0.15;

  return {
    availability_score:     clamp(availability),
    security_score:         clamp(security),
    compliance_score:       clamp(compliance),
    data_protection_score:  clamp(dataProtection),
    connectivity_score:     clamp(connectivity),
    overall_score:          clamp(overall),
  };
}

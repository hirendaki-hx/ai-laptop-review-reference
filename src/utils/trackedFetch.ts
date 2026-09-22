/**
 * Tracked Fetch Utility
 *
 * Provides network tracking and audit logging around native fetch calls.
 * CRITICAL: Does NOT touch global window.fetch or use Object.defineProperty
 * on window to remain fully compatible with sandboxed iframe environments.
 */

export interface NetworkAuditLogEntry {
  id: string;
  timestamp: string;
  method: string;
  url: string;
  status?: number;
  ok?: boolean;
  durationMs?: number;
  error?: string;
}

// In-memory audit trail for network operations
const networkAuditLog: NetworkAuditLogEntry[] = [];
const MAX_AUDIT_LOG_SIZE = 100;

export function getNetworkAuditLog(): NetworkAuditLogEntry[] {
  return [...networkAuditLog];
}

export function clearNetworkAuditLog(): void {
  networkAuditLog.length = 0;
}

export async function trackedFetch(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  const startTime = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const id = `req-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const url =
    typeof input === 'string'
      ? input
      : input instanceof URL
      ? input.toString()
      : (input as Request).url;
  const method =
    init?.method?.toUpperCase() ||
    (typeof input === 'object' && 'method' in input && (input as Request).method
      ? (input as Request).method.toUpperCase()
      : 'GET');

  const auditEntry: NetworkAuditLogEntry = {
    id,
    timestamp: new Date().toISOString(),
    method,
    url,
  };

  try {
    // Directly call the real native fetch without modifying window.fetch
    const response = await fetch(input, init);
    const durationMs = Math.round(
      (typeof performance !== 'undefined' ? performance.now() : Date.now()) - startTime
    );

    auditEntry.status = response.status;
    auditEntry.ok = response.ok;
    auditEntry.durationMs = durationMs;

    // Keep ring buffer constrained
    if (networkAuditLog.length >= MAX_AUDIT_LOG_SIZE) {
      networkAuditLog.shift();
    }
    networkAuditLog.push(auditEntry);

    return response;
  } catch (err: any) {
    const durationMs = Math.round(
      (typeof performance !== 'undefined' ? performance.now() : Date.now()) - startTime
    );
    auditEntry.durationMs = durationMs;
    auditEntry.error = err?.message || 'Network error';
    auditEntry.ok = false;

    if (networkAuditLog.length >= MAX_AUDIT_LOG_SIZE) {
      networkAuditLog.shift();
    }
    networkAuditLog.push(auditEntry);

    throw err;
  }
}

export default trackedFetch;

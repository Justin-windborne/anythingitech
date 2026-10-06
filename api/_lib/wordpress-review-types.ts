export type Severity = 'info' | 'warn' | 'high';

export interface AuditFinding {
  id: string;
  severity: Severity;
  title: string;
  detail: string;
}

export interface ReviewScore {
  /** 1–10. 10 is the strong end. Half points are allowed. */
  value: number;
  band: string;
  limited: boolean;
  notes: string[];
}

export interface AuditReport {
  ok: true;
  domain: string;
  finalUrl: string | null;
  transport: 'https' | 'http' | null;
  wordpress: boolean;
  summary: string;
  findings: AuditFinding[];
  hygiene: ReviewScore;
  presence: ReviewScore;
  scannedAt: string;
  checksRun: number;
}

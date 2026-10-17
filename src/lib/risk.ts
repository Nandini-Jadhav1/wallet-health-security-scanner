/**
 * src/lib/risk.ts
 *
 * Risk scoring for ERC-20 token approvals.
 *
 * scoreApproval() classifies each approval as HIGH / MEDIUM / INFO / LOW
 * and returns a plain-English explanation suitable for display to non-technical users.
 *
 * walletScore() turns the set of risk levels into a 0-100 health score.
 */

import type { Provider } from 'ethers';
import type { ApprovalRecord } from './scanner';
import type { KnownRouter } from './routers';
import { getKnownRouter } from './routers';

export type RiskLevel = 'HIGH' | 'MEDIUM' | 'INFO' | 'LOW';

export interface RiskEvaluation {
  level: RiskLevel;
  badgeText: string;
  badgeColor: { bg: string; text: string; border: string };
  explanation: string;   // Plain English for non-technical users
  reasons: string[];
}

export interface HealthScoreResult {
  score: number;
  rating: 'EXCELLENT' | 'MODERATE' | 'CRITICAL';
  color: string;
  highCount: number;
  mediumCount: number;
  lowCount: number;
  formula: string;
}

// ── scoreApproval ──────────────────────────────────────────────────────────

/**
 * Evaluates one approval and returns its risk profile.
 *
 * Rules (applied in priority order):
 *  HIGH   — allowance >= 2^255 ("unlimited")
 *  MEDIUM — approval is > 180 days old (by block timestamp), OR spender is an EOA
 *  INFO   — spender is a verified known router from routers.ts
 *  LOW    — everything else (limited allowance, recent, contract spender)
 *
 * @param provider       ethers Provider for getCode() calls
 * @param approval       Approval record from the scanner
 * @param knownSpenders  Optional pre-loaded router map (saves RPC round-trips)
 */
export async function scoreApproval(
  provider: Provider,
  approval: ApprovalRecord,
  knownSpenders?: Record<string, KnownRouter>
): Promise<RiskEvaluation> {
  const reasons: string[] = [];
  let isHigh = false;
  let isMedium = false;

  // 1. Unlimited allowance check (HIGH)
  // WHY: An unlimited approval lets the spender drain ALL of your token balance
  // at any future time, until you explicitly revoke it.
  if (approval.isUnlimited) {
    isHigh = true;
    reasons.push('Unlimited Allowance');
  }

  // 2. Age check (MEDIUM)
  // WHY: Old unused approvals are forgotten attack surfaces. 180 days is a
  // conservative threshold — if you haven't interacted with a protocol in
  // half a year, you probably don't need the permission any more.
  const SECONDS_IN_180_DAYS = 180 * 24 * 60 * 60;
  const now = Math.floor(Date.now() / 1000);
  const ageInSeconds = now - approval.lastUpdatedTimestamp;
  const daysOld = Math.floor(ageInSeconds / (24 * 60 * 60));

  if (ageInSeconds >= SECONDS_IN_180_DAYS) {
    isMedium = true;
    reasons.push(`Older than 180 days (${daysOld}d)`);
  }

  // 3. EOA spender check (MEDIUM)
  // WHY: Legitimate protocols are smart contracts. If the spender is a regular
  // wallet (EOA, i.e. getCode === "0x"), no protocol put it there — this is
  // likely a phishing approval.
  let isEoa = false;
  try {
    const code = await provider.getCode(approval.spender);
    if (code === '0x' || code === '0x0') {
      isEoa = true;
      isMedium = true;
      reasons.push('Spender is a personal wallet (EOA)');
    }
  } catch (err) {
    console.warn(`scoreApproval: could not check bytecode for ${approval.spender}`, err);
  }

  // 4. Known router check (INFO)
  const known = knownSpenders
    ? knownSpenders[approval.spender.toLowerCase()]
    : getKnownRouter(approval.spender);

  // Assign level and return plain-English explanation
  if (isHigh) {
    return {
      level: 'HIGH',
      badgeText: 'High Risk',
      badgeColor: {
        bg: 'bg-rose-500/10 dark:bg-rose-500/20',
        text: 'text-rose-600 dark:text-rose-400',
        border: 'border-rose-500/30',
      },
      explanation: `This address can spend ALL of your ${approval.symbol} at any time until you revoke it.`,
      reasons,
    };
  }

  if (isMedium) {
    const reasonText = isEoa
      ? `The spender is an individual wallet (EOA), not a verified protocol contract. This is unusual and potentially dangerous.`
      : `Granted ${daysOld} days ago. Stale unused permissions are silent attack surfaces.`;
    return {
      level: 'MEDIUM',
      badgeText: 'Medium Risk',
      badgeColor: {
        bg: 'bg-amber-500/10 dark:bg-amber-500/20',
        text: 'text-amber-600 dark:text-amber-400',
        border: 'border-amber-500/30',
      },
      explanation: reasonText,
      reasons,
    };
  }

  if (known) {
    return {
      level: 'INFO',
      badgeText: `Known: ${known.protocol}`,
      badgeColor: {
        bg: 'bg-sky-500/10 dark:bg-sky-500/20',
        text: 'text-sky-600 dark:text-sky-400',
        border: 'border-sky-500/30',
      },
      explanation: `Verified official router: ${known.protocol} (${known.name}). Allowance is capped at ${approval.allowanceFormatted} ${approval.symbol}.`,
      reasons: [`Verified Protocol (${known.protocol})`],
    };
  }

  return {
    level: 'LOW',
    badgeText: 'Low Risk',
    badgeColor: {
      bg: 'bg-emerald-500/10 dark:bg-emerald-500/20',
      text: 'text-emerald-600 dark:text-emerald-400',
      border: 'border-emerald-500/30',
    },
    explanation: `Allowance is limited to ${approval.allowanceFormatted} ${approval.symbol} and was granted recently.`,
    reasons: ['Limited Allowance'],
  };
}

// ── walletScore ────────────────────────────────────────────────────────────

/**
 * Converts a list of risk levels into a 0-100 Wallet Health Score.
 *
 * Deductions: HIGH = -25, MEDIUM = -10, LOW/INFO = -2. Floor is 0.
 */
export function walletScore(levels: RiskLevel[]): number {
  let score = 100;
  for (const level of levels) {
    if (level === 'HIGH') score -= 25;
    else if (level === 'MEDIUM') score -= 10;
    else score -= 2;
  }
  return Math.max(0, score);
}

/**
 * Full health score calculation with rating and formula string.
 * Used by App.tsx and HealthScore component.
 */
export function calculateHealthScore(evaluations: RiskEvaluation[]): HealthScoreResult {
  let score = 100;
  let highCount = 0;
  let mediumCount = 0;
  let lowCount = 0;

  for (const ev of evaluations) {
    if (ev.level === 'HIGH') { score -= 25; highCount++; }
    else if (ev.level === 'MEDIUM') { score -= 10; mediumCount++; }
    else { score -= 2; lowCount++; }
  }

  const finalScore = Math.max(0, score);
  let rating: 'EXCELLENT' | 'MODERATE' | 'CRITICAL' = 'EXCELLENT';
  let color = '#10b981';

  if (finalScore < 50) { rating = 'CRITICAL'; color = '#f43f5e'; }
  else if (finalScore < 80) { rating = 'MODERATE'; color = '#f59e0b'; }

  const formula = `100 − (${highCount}×25 HIGH) − (${mediumCount}×10 MED) − (${lowCount}×2 LOW) = ${finalScore}/100`;

  return { score: finalScore, rating, color, highCount, mediumCount, lowCount, formula };
}

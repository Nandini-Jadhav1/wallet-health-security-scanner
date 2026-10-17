import React, { useState } from 'react';
import type { HealthScoreResult } from '../lib/risk';
import { HelpCircle, Shield, AlertTriangle, AlertOctagon } from 'lucide-react';

interface HealthScoreProps {
  scoreResult: HealthScoreResult;
}

export const HealthScore: React.FC<HealthScoreProps> = ({ scoreResult }) => {
  const [showTooltip, setShowTooltip] = useState(false);

  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (scoreResult.score / 100) * circumference;

  return (
    <div className="relative bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-6 transition">
      {/* Gauge and Score */}
      <div className="flex items-center gap-5">
        <div className="relative w-28 h-28 flex items-center justify-center shrink-0">
          <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
            {/* Background Circle */}
            <circle
              cx="50"
              cy="50"
              r={radius}
              stroke="currentColor"
              strokeWidth="9"
              fill="transparent"
              className="text-slate-100 dark:text-slate-800"
            />
            {/* Foreground Score Ring */}
            <circle
              cx="50"
              cy="50"
              r={radius}
              stroke={scoreResult.color}
              strokeWidth="9"
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
              strokeLinecap="round"
              fill="transparent"
              className="transition-all duration-1000 ease-out"
            />
          </svg>

          <div className="absolute flex flex-col items-center justify-center text-center">
            <span className="text-2xl font-black tracking-tight text-slate-900 dark:text-slate-100 font-mono">
              {scoreResult.score}
            </span>
            <span className="text-[10px] uppercase font-bold text-slate-400">/ 100</span>
          </div>
        </div>

        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">
              Wallet Health Score
            </h3>
            <div className="relative">
              <button
                type="button"
                onMouseEnter={() => setShowTooltip(true)}
                onMouseLeave={() => setShowTooltip(false)}
                onClick={() => setShowTooltip(!showTooltip)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition"
                title="How is this calculated?"
              >
                <HelpCircle className="w-4 h-4" />
              </button>

              {/* Transparent Calculation Tooltip */}
              {showTooltip && (
                <div className="absolute left-0 bottom-full mb-2 w-72 p-3 bg-slate-900 text-slate-100 text-xs rounded-xl shadow-2xl z-50 pointer-events-none border border-slate-700 space-y-1.5 animate-fade-in">
                  <div className="font-semibold text-slate-200 border-b border-slate-800 pb-1">
                    Transparent Scoring Rules
                  </div>
                  <ul className="space-y-1 text-slate-300">
                    <li>• Starts at a baseline of <strong>100 points</strong></li>
                    <li>• <span className="text-rose-400">-25 pts</span> per High Risk (Unlimited approval)</li>
                    <li>• <span className="text-amber-400">-10 pts</span> per Medium Risk (&gt;180d or EOA spender)</li>
                    <li>• <span className="text-sky-400">-2 pts</span> per Low/Info active approval</li>
                    <li>• Bounded at a minimum floor of <strong>0</strong></li>
                  </ul>
                  <div className="pt-1 border-t border-slate-800 text-[11px] font-mono text-indigo-300">
                    {scoreResult.formula}
                  </div>
                </div>
              )}
            </div>
          </div>

          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm">
            {scoreResult.rating === 'EXCELLENT' &&
              'Your wallet has very few or zero risky token permissions. Great security hygiene!'}
            {scoreResult.rating === 'MODERATE' &&
              'Caution: You have lingering or stale approvals. Consider revoking unused spenders.'}
            {scoreResult.rating === 'CRITICAL' &&
              'Warning: Multiple contracts have unlimited access to your tokens. Immediate revocation recommended!'}
          </p>

          <div className="pt-1">
            <span
              className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold"
              style={{
                backgroundColor: `${scoreResult.color}15`,
                color: scoreResult.color,
                border: `1px solid ${scoreResult.color}35`,
              }}
            >
              {scoreResult.rating === 'EXCELLENT' && <Shield className="w-3.5 h-3.5" />}
              {scoreResult.rating === 'MODERATE' && <AlertTriangle className="w-3.5 h-3.5" />}
              {scoreResult.rating === 'CRITICAL' && <AlertOctagon className="w-3.5 h-3.5" />}
              {scoreResult.rating} RISK
            </span>
          </div>
        </div>
      </div>

      {/* Risk Category Breakdown Cards */}
      <div className="grid grid-cols-3 gap-3 w-full sm:w-auto text-center shrink-0">
        <div className="bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/50 rounded-2xl p-3 min-w-[76px]">
          <span className="block text-xl font-bold font-mono text-rose-600 dark:text-rose-400">
            {scoreResult.highCount}
          </span>
          <span className="text-[11px] font-medium text-rose-700 dark:text-rose-300">High</span>
        </div>

        <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 rounded-2xl p-3 min-w-[76px]">
          <span className="block text-xl font-bold font-mono text-amber-600 dark:text-amber-400">
            {scoreResult.mediumCount}
          </span>
          <span className="text-[11px] font-medium text-amber-700 dark:text-amber-300">Medium</span>
        </div>

        <div className="bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/50 rounded-2xl p-3 min-w-[76px]">
          <span className="block text-xl font-bold font-mono text-emerald-600 dark:text-emerald-400">
            {scoreResult.lowCount}
          </span>
          <span className="text-[11px] font-medium text-emerald-700 dark:text-emerald-300">Low/Known</span>
        </div>
      </div>
    </div>
  );
};

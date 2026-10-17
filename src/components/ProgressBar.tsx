import React from 'react';
import type { ScanProgress } from '../lib/scanner';
import { ShieldCheck, Activity } from 'lucide-react';

interface ProgressBarProps {
  progress: ScanProgress;
  isScanning: boolean;
}

export const ProgressBar: React.FC<ProgressBarProps> = ({ progress, isScanning }) => {
  if (!isScanning && progress.percent === 0) return null;

  return (
    <div className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-5 shadow-sm space-y-3 transition">
      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center gap-2 font-medium text-slate-800 dark:text-slate-200">
          <Activity className="w-4 h-4 text-indigo-500 animate-pulse" />
          <span>{progress.message || 'Scanning blockchain events...'}</span>
        </div>
        <span className="font-mono font-bold text-indigo-600 dark:text-indigo-400">
          {progress.percent}%
        </span>
      </div>

      {/* Progress Track */}
      <div className="w-full bg-slate-100 dark:bg-slate-800 h-2.5 rounded-full overflow-hidden relative">
        <div
          className="h-full bg-gradient-to-r from-indigo-500 to-purple-600 rounded-full transition-all duration-300 ease-out"
          style={{ width: `${Math.max(4, progress.percent)}%` }}
        />
      </div>

      <div className="flex flex-wrap items-center justify-between text-xs text-slate-500 dark:text-slate-400 font-mono">
        {progress.totalChunks > 0 && (
          <span>
            Chunk {progress.currentChunk} of {progress.totalChunks}
          </span>
        )}
        {progress.foundEvents > 0 && (
          <span className="flex items-center gap-1 text-indigo-600 dark:text-indigo-400 font-medium">
            <ShieldCheck className="w-3.5 h-3.5" />
            {progress.foundEvents} active approval event{progress.foundEvents === 1 ? '' : 's'} identified
          </span>
        )}
      </div>
    </div>
  );
};

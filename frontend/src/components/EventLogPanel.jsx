import React, { useState } from 'react';
import { Terminal, ShieldAlert, CheckCircle2, Info, AlertTriangle } from 'lucide-react';

export default function EventLogPanel({ logs }) {
  const [filter, setFilter] = useState('ALL');

  const filteredLogs = (logs || []).filter((log) => {
    if (filter === 'ALL') return true;
    if (filter === 'LOOPS') return log.level === 'danger' || log.message.includes('LOOP');
    if (filter === 'WARNINGS') return log.level === 'warning' || log.level === 'danger';
    if (filter === 'LS') return log.protocol.includes('State');
    if (filter === 'DV') return log.protocol.includes('Vector');
    return true;
  });

  return (
    <div className="bg-[var(--bg-card)] border border-[var(--border-card)] rounded-2xl p-3 sm:p-4 shadow-xl backdrop-blur-xl h-full flex flex-col transition-colors">
      {/* Header & Filter Controls */}
      <div className="flex items-center justify-between border-b border-slate-800/80 pb-3 mb-3">
        <div className="flex items-center gap-2">
          <Terminal className="w-4 h-4 text-cyan-400" />
          <h3 className="text-xs font-bold text-slate-200 tracking-wide uppercase font-mono">
            Control Plane Telemetry Stream
          </h3>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-1 bg-slate-900 p-0.5 rounded-lg border border-slate-800 text-[10px]">
          {['ALL', 'LOOPS', 'WARNINGS', 'LS', 'DV'].map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-2 py-0.5 rounded font-mono font-semibold transition-colors ${
                filter === f
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* Log Feed */}
      <div className="flex-1 overflow-y-auto space-y-2 pr-1 font-mono text-[11px] min-h-[140px] max-h-[220px]">
        {filteredLogs.map((log, idx) => {
          const isDanger = log.level === 'danger';
          const isWarning = log.level === 'warning';
          const isSuccess = log.level === 'success';

          return (
            <div
              key={idx}
              className={`p-2 rounded-xl border transition-colors flex items-start gap-2.5 ${
                isDanger
                  ? 'bg-rose-950/40 border-rose-600/40 text-rose-200'
                  : isWarning
                  ? 'bg-amber-950/30 border-amber-600/30 text-amber-200'
                  : isSuccess
                  ? 'bg-emerald-950/30 border-emerald-600/30 text-emerald-200'
                  : 'bg-zinc-900/60 border-zinc-800 text-slate-300'
              }`}
            >
              {/* Severity Icon */}
              <div className="mt-0.5">
                {isDanger && <ShieldAlert className="w-3.5 h-3.5 text-rose-400" />}
                {isWarning && <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />}
                {isSuccess && <CheckCircle2 className="w-3.5 h-3.5 text-[#1ed760]" />}
                {!isDanger && !isWarning && !isSuccess && <Info className="w-3.5 h-3.5 text-slate-400" />}
              </div>

              {/* Message Details */}
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-400 font-bold">
                    Tick {log.tick}
                  </span>
                  <span
                    className={`text-[10px] font-bold ${
                      log.protocol?.includes('State') ? 'text-cyan-400' : 'text-amber-400'
                    }`}
                  >
                    {log.protocol}
                  </span>
                </div>
                <div className="leading-snug">{log.message}</div>
              </div>
            </div>
          );
        })}

        {filteredLogs.length === 0 && (
          <div className="text-center py-6 text-slate-500 italic text-xs">
            No telemetry records matching filter.
          </div>
        )}
      </div>
    </div>
  );
}


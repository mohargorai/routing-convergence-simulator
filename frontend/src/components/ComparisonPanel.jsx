import React from 'react';
import { X, Trophy } from 'lucide-react';

export default function ComparisonPanel({ benchmarkData, onClose, onRerun }) {
  if (!benchmarkData) return null;

  const ls = benchmarkData.link_state;
  const dv = benchmarkData.distance_vector;

  const isLsFaster = ls.ticks < dv.ticks;
  const isDvFaster = dv.ticks < ls.ticks;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/70 backdrop-blur-md animate-fade-in">
      <div className="relative w-full max-w-3xl bg-[#0f172a] border border-cyan-500/40 rounded-3xl shadow-[0_0_60px_rgba(6,182,212,0.2)] max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 border-b border-slate-800 bg-slate-900/60">
          <div className="flex items-center gap-3">
            <div className="p-2 sm:p-2.5 bg-gradient-to-br from-cyan-500 to-indigo-600 rounded-2xl text-white shadow-lg">
              <Trophy className="w-5 h-5 sm:w-6 sm:h-6" />
            </div>
            <div>
              <h2 className="text-base sm:text-xl font-bold text-white">Dual-Protocol Convergence Benchmark</h2>
              <p className="text-[11px] sm:text-xs text-slate-400">
                Topology: <strong className="text-cyan-300 font-mono">{benchmarkData.topology_name}</strong> •{' '}
                {benchmarkData.node_count} Nodes • {benchmarkData.link_count} Links
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 sm:p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Verdict Banner */}
        <div className="px-4 sm:px-6 py-2.5 sm:py-3 bg-gradient-to-r from-cyan-950/40 to-slate-900 border-b border-slate-800 text-xs flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-cyan-400 font-bold uppercase tracking-wider">Analysis:</span>
            <span className="text-slate-200 font-medium">{benchmarkData.verdict}</span>
          </div>
          <button
            onClick={onRerun}
            className="px-3 py-1 bg-cyan-600/30 hover:bg-cyan-600/50 text-cyan-300 rounded-lg text-xs font-semibold border border-cyan-500/30 transition-colors"
          >
            Re-run Benchmark
          </button>
        </div>

        {/* Comparison Cards Side-by-Side */}
        <div className="p-4 sm:p-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Link State Card */}
          <div
            className={`p-5 rounded-2xl border transition-all ${
              isLsFaster
                ? 'bg-cyan-950/20 border-cyan-500/50 shadow-[0_0_25px_rgba(6,182,212,0.1)]'
                : 'bg-slate-900/40 border-slate-800'
            }`}
          >
            <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-cyan-400" />
                <h3 className="font-bold text-white text-sm">Link State (OSPF)</h3>
              </div>
              {isLsFaster && (
                <span className="px-2 py-0.5 rounded-full bg-cyan-500/20 border border-cyan-500/40 text-cyan-300 text-[10px] font-bold">
                  FASTER CONVERGENCE
                </span>
              )}
            </div>

            <div className="space-y-3 font-mono text-xs">
              <div className="flex justify-between items-center py-1 border-b border-slate-800/60">
                <span className="text-slate-400">Convergence Speed:</span>
                <span className="text-cyan-300 font-bold">{ls.ticks} ticks ({ls.duration_ms} ms)</span>
              </div>
              <div className="flex justify-between items-center py-1 border-b border-slate-800/60">
                <span className="text-slate-400">Control Packets (LSAs):</span>
                <span className="text-cyan-300 font-bold">{ls.control_packets} packets</span>
              </div>
              <div className="flex justify-between items-center py-1 border-b border-slate-800/60">
                <span className="text-slate-400">Average Path Hops:</span>
                <span className="text-cyan-300 font-bold">{ls.avg_hop_count} hops</span>
              </div>
              <div className="flex justify-between items-center py-1">
                <span className="text-slate-400">Routing Loops:</span>
                <span className="text-emerald-400 font-bold">0 (Loop-Free SPF)</span>
              </div>
            </div>

            <div className="mt-4 p-2.5 bg-slate-950/60 rounded-xl text-[11px] text-slate-400 border border-slate-800/80">
              <strong className="text-slate-300 block mb-0.5">Algorithm:</strong>
              Dijkstra Shortest Path First on complete synchronized LSDB. Floods only on link topology mutations.
            </div>
          </div>

          {/* Distance Vector Card */}
          <div
            className={`p-5 rounded-2xl border transition-all ${
              isDvFaster
                ? 'bg-amber-950/20 border-amber-500/50 shadow-[0_0_25px_rgba(245,158,11,0.1)]'
                : 'bg-slate-900/40 border-slate-800'
            }`}
          >
            <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-amber-400" />
                <h3 className="font-bold text-white text-sm">Distance Vector (RIP)</h3>
              </div>
              {isDvFaster && (
                <span className="px-2 py-0.5 rounded-full bg-amber-500/20 border border-amber-500/40 text-amber-300 text-[10px] font-bold">
                  MATCHED SPEED
                </span>
              )}
            </div>

            <div className="space-y-3 font-mono text-xs">
              <div className="flex justify-between items-center py-1 border-b border-slate-800/60">
                <span className="text-slate-400">Convergence Speed:</span>
                <span className="text-amber-300 font-bold">{dv.ticks} ticks ({dv.duration_ms} ms)</span>
              </div>
              <div className="flex justify-between items-center py-1 border-b border-slate-800/60">
                <span className="text-slate-400">Control Packets (Vectors):</span>
                <span className="text-amber-300 font-bold">{dv.control_packets} packets</span>
              </div>
              <div className="flex justify-between items-center py-1 border-b border-slate-800/60">
                <span className="text-slate-400">Split Horizon:</span>
                <span className="text-amber-300 font-bold">{dv.split_horizon ? 'ACTIVE' : 'DISABLED'}</span>
              </div>
              <div className="flex justify-between items-center py-1">
                <span className="text-slate-400">Count-to-Infinity Loops:</span>
                <span className={dv.loops_detected > 0 ? 'text-rose-400 font-bold' : 'text-emerald-400 font-bold'}>
                  {dv.loops_detected} loops
                </span>
              </div>
            </div>

            <div className="mt-4 p-2.5 bg-slate-950/60 rounded-xl text-[11px] text-slate-400 border border-slate-800/80">
              <strong className="text-slate-300 block mb-0.5">Algorithm:</strong>
              Distributed Bellman-Ford next-hop exchange. Requires Split Horizon & Poison Reverse to avert loops.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}


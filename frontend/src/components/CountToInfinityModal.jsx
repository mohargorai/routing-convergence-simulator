import React, { useState } from 'react';
import { AlertTriangle, ShieldCheck, Play, SkipForward, RotateCcw, X, Info, Zap, ArrowRight } from 'lucide-react';

export default function CountToInfinityModal({
  onClose,
  onLoadPreset,
  onToggleLink,
  onSetDvOptions,
  dvOptions,
  onStep,
  topology,
  activeTelemetry,
}) {
  const [stepStage, setStepStage] = useState(0);

  const handleSetupLab = () => {
    // 1. Load Count-to-Infinity Line Preset
    onLoadPreset('count_to_infinity');
    // 2. Disable Split Horizon and Poison Reverse
    onSetDvOptions({ split_horizon: false, poison_reverse: false, infinity_metric: 16 });
    setStepStage(1);
  };

  const handleCutLink = () => {
    // Cut link B-C
    onToggleLink('B', 'C');
    setStepStage(2);
  };

  const handleEnablePoisonReverse = () => {
    onSetDvOptions({ split_horizon: true, poison_reverse: true, infinity_metric: 16 });
  };

  const isPoisonReverseOn = dvOptions?.poison_reverse && dvOptions?.split_horizon;
  const loopCount = activeTelemetry?.loops_detected ?? 0;
  const tick = activeTelemetry?.tick ?? 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
      <div className="relative w-full max-w-3xl bg-[#0f172a] border border-amber-500/40 rounded-3xl p-6 shadow-2xl space-y-5">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-amber-500/10 border border-amber-500/30 rounded-xl text-amber-400">
              <AlertTriangle className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <h2 className="text-base font-extrabold text-white flex items-center gap-2">
                Count-to-Infinity & Poison Reverse Lab
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-amber-950 text-amber-300 border border-amber-800">
                  RFC 1058 / Kurose & Ross
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Visual demonstration of routing loops in Distance Vector algorithms and the Poison Reverse mitigation
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-xl bg-slate-800/80 hover:bg-slate-700 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 3-Step Guided Experiment Wizard */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {/* Step 1 */}
          <div className={`p-3.5 rounded-2xl border text-xs space-y-2 transition-all ${
            stepStage === 0
              ? 'bg-amber-500/10 border-amber-500/50 shadow-[0_0_15px_rgba(245,158,11,0.1)]'
              : 'bg-slate-900/60 border-slate-800'
          }`}>
            <div className="flex items-center justify-between">
              <span className="font-bold text-amber-400 font-mono">STEP 1</span>
              {stepStage > 0 && <span className="text-emerald-400 font-bold">✓ Ready</span>}
            </div>
            <div className="font-semibold text-slate-200">Load Line Topology</div>
            <p className="text-[11px] text-slate-400">
              Configures a 3-router line: <strong>A — B — C</strong> (costs: A-B=1, B-C=1) with Split Horizon disabled.
            </p>
            <button
              onClick={handleSetupLab}
              className="w-full py-1.5 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold rounded-xl text-xs transition-colors cursor-pointer"
            >
              1. Setup Experiment
            </button>
          </div>

          {/* Step 2 */}
          <div className={`p-3.5 rounded-2xl border text-xs space-y-2 transition-all ${
            stepStage === 1
              ? 'bg-rose-500/10 border-rose-500/50 shadow-[0_0_15px_rgba(244,63,94,0.1)]'
              : 'bg-slate-900/60 border-slate-800'
          }`}>
            <div className="flex items-center justify-between">
              <span className="font-bold text-rose-400 font-mono">STEP 2</span>
              {stepStage > 1 && <span className="text-emerald-400 font-bold">✓ Broken</span>}
            </div>
            <div className="font-semibold text-slate-200">Sever Link B — C</div>
            <p className="text-[11px] text-slate-400">
              Simulates a catastrophic link failure. B loses direct route to C and falls into A's advertised trap.
            </p>
            <button
              onClick={handleCutLink}
              disabled={stepStage < 1}
              className="w-full py-1.5 bg-rose-600 hover:bg-rose-500 disabled:opacity-40 text-white font-bold rounded-xl text-xs transition-colors cursor-pointer"
            >
              2. Cut Link B — C
            </button>
          </div>

          {/* Step 3 */}
          <div className={`p-3.5 rounded-2xl border text-xs space-y-2 transition-all ${
            stepStage >= 2
              ? 'bg-emerald-500/10 border-emerald-500/50 shadow-[0_0_15px_rgba(16,185,129,0.1)]'
              : 'bg-slate-900/60 border-slate-800'
          }`}>
            <div className="flex items-center justify-between">
              <span className="font-bold text-emerald-400 font-mono">STEP 3</span>
              <span className="text-slate-500 font-mono text-[10px]">t={tick}</span>
            </div>
            <div className="font-semibold text-slate-200">Step & Observe</div>
            <p className="text-[11px] text-slate-400">
              Watch cost to C inflate: <strong>2 → 3 → 4 → 5 ... 16</strong>. Loop counter increments every tick!
            </p>
            <button
              onClick={onStep}
              className="w-full py-1.5 bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold rounded-xl text-xs transition-colors cursor-pointer flex items-center justify-center gap-1.5"
            >
              <SkipForward className="w-3.5 h-3.5" />
              Step Tick (Inflate)
            </button>
          </div>
        </div>

        {/* Live Status Callout */}
        <div className="p-4 bg-slate-900/90 rounded-2xl border border-slate-800 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-300">Poison Reverse Mitigation:</span>
              <span className={`px-2 py-0.5 rounded-full text-xs font-mono font-bold ${
                isPoisonReverseOn
                  ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                  : 'bg-rose-950 text-rose-400 border border-rose-800'
              }`}>
                {isPoisonReverseOn ? 'ACTIVE (Loop-Free)' : 'DISABLED (Vulnerable)'}
              </span>
            </div>

            <button
              onClick={handleEnablePoisonReverse}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                isPoisonReverseOn
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 cursor-default'
                  : 'bg-emerald-500 hover:bg-emerald-400 text-zinc-950 shadow-md shadow-emerald-500/20'
              }`}
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              {isPoisonReverseOn ? 'Poison Reverse Enabled' : 'Enable Poison Reverse'}
            </button>
          </div>

          {/* Academic Theory Explainer */}
          <div className="p-3 bg-black/40 rounded-xl border border-slate-800/80 text-xs text-slate-300 space-y-1.5 font-mono">
            <div className="flex items-center gap-1 text-cyan-400 font-bold font-sans">
              <Info className="w-3.5 h-3.5" />
              Theoretical Root Cause (Bellman-Ford Distributed Equation):
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed font-sans">
              When link B—C breaks, B needs a route to C. Because Split Horizon is OFF, A continues to advertise
              <code className="text-amber-300 px-1 mx-1 bg-amber-950/60 rounded">D_A(C) = 2</code>.
              Router B believes A has an independent alternate path to C, so B computes:
              <code className="text-cyan-300 px-1 mx-1 bg-cyan-950/60 rounded">D_B(C) = c(B, A) + D_A(C) = 1 + 2 = 3</code> via A.
              In the next tick, A sees B's new cost of 3 and computes
              <code className="text-cyan-300 px-1 mx-1 bg-cyan-950/60 rounded">D_A(C) = 1 + 3 = 4</code>.
              They continue bouncing the packet between each other until the metric exceeds infinity (16).
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between text-xs text-slate-400 border-t border-slate-800 pt-3">
          <span>Active loops caught: <strong className="text-rose-400 font-mono font-bold">{loopCount}</strong></span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl font-semibold transition-colors cursor-pointer"
          >
            Close Lab
          </button>
        </div>
      </div>
    </div>
  );
}


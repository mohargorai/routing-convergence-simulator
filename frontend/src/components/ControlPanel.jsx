import React from 'react';
import {
  Play,
  Pause,
  SkipForward,
  RotateCcw,
  CheckCircle,
  Zap,
  BarChart3,
  Plus,
  Link as LinkIcon,
  Layers,
  Info,
  AlertTriangle,
  FileText,
  Loader2,
  Clock,
} from 'lucide-react';

export default function ControlPanel({
  protocol,
  isRunning,
  speedMs,
  presetName,
  activeTelemetry,
  dvOptions,
  onSetProtocol,
  onSetDvOptions,
  onToggleRun,
  onStep,
  onReset,
  onSetSpeed,
  onLoadPreset,
  onOpenAddNode,
  onStartAddLink,
  onOpenBenchmark,
  onOpenCountToInfinity,
  onOpenLabReport,
}) {
  const isConverged = activeTelemetry?.is_converged;
  const tick = activeTelemetry?.tick ?? 0;
  const inFlightCount = activeTelemetry?.in_flight_count ?? 0;

  const [localPreset, setLocalPreset] = React.useState(presetName);
  const [isPresetLoading, setIsPresetLoading] = React.useState(false);

  React.useEffect(() => {
    setLocalPreset(presetName);
    setIsPresetLoading(false);
  }, [presetName]);

  const handleSelectPreset = (val) => {
    setLocalPreset(val);
    setIsPresetLoading(true);
    onLoadPreset(val);
  };

  const explainerText =
    protocol === 'LS'
      ? 'Link State (OSPF): Every router floods LSAs across neighbors to synchronize a full network map, then executes Dijkstra SPF.'
      : protocol === 'DV'
      ? 'Distance Vector (RIP): Routers only exchange distance vectors with direct neighbors via Bellman-Ford iterations.'
      : 'Dual Comparison: Link State and Distance Vector run simultaneously on the exact same topology for side-by-side benchmarking.';

  return (
    <div className="bg-[var(--bg-card)] border border-[var(--border-card)] rounded-2xl p-3 sm:p-4 shadow-xl space-y-3 transition-colors">
      {/* Top Row: Protocol Selector & Presets */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border-subtle)] pb-3">
        {/* Protocol Switcher */}
        <div className="flex items-center p-1 bg-[var(--bg-card-subtle)] rounded-xl border border-[var(--border-subtle)]">
          <button
            onClick={() => onSetProtocol('LS')}
            className={`px-2.5 sm:px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
              protocol === 'LS'
                ? 'bg-sky-500 text-zinc-950 font-bold shadow-md shadow-sky-500/20'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <span className="hidden sm:inline">Link State (OSPF)</span>
            <span className="sm:hidden font-mono font-bold">OSPF</span>
          </button>
          <button
            onClick={() => onSetProtocol('DV')}
            className={`px-2.5 sm:px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
              protocol === 'DV'
                ? 'bg-amber-500 text-zinc-950 font-bold shadow-md shadow-amber-500/20'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <span className="hidden sm:inline">Distance Vector (RIP)</span>
            <span className="sm:hidden font-mono font-bold">RIP</span>
          </button>
          <button
            onClick={() => onSetProtocol('DUAL')}
            className={`flex items-center gap-1.5 px-2.5 sm:px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
              protocol === 'DUAL'
                ? 'bg-indigo-500 text-white font-bold shadow-md'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <BarChart3 className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Dual Comparison</span>
            <span className="sm:hidden">Dual</span>
          </button>
        </div>

        {/* Preset Selector & Teacher Lab Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2 bg-zinc-900 border border-zinc-750 rounded-xl px-2.5 py-1 text-xs">
            {isPresetLoading ? (
              <Loader2 className="w-3.5 h-3.5 text-sky-400 animate-spin" />
            ) : (
              <Layers className="w-3.5 h-3.5 text-zinc-400" />
            )}
            <select
              value={localPreset}
              onChange={(e) => handleSelectPreset(e.target.value)}
              disabled={isPresetLoading}
              style={{ colorScheme: 'dark' }}
              className="bg-zinc-900 text-zinc-100 outline-none cursor-pointer font-medium text-xs pr-1 border-0 disabled:opacity-70 max-w-[135px] sm:max-w-none truncate"
            >
              <option value="triangle" className="bg-zinc-900 text-zinc-100">3-Node Triangle (Classic Loop)</option>
              <option value="diamond" className="bg-zinc-900 text-zinc-100">4-Node Diamond (Multi-Path)</option>
              <option value="count_to_infinity" className="bg-zinc-900 text-zinc-100">Count-to-Infinity Trap (Line)</option>
              <option value="ring_5" className="bg-zinc-900 text-zinc-100">5-Node Ring Network</option>
              <option value="mesh_6" className="bg-zinc-900 text-zinc-100">6-Node Dense Mesh</option>
            </select>
          </div>

          <button
            onClick={onOpenCountToInfinity}
            className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
            title="Launch interactive Count-to-Infinity demonstration lab"
          >
            <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
            <span className="hidden sm:inline">Count-to-Infinity Lab</span>
            <span className="sm:hidden">Count-to-Infinity</span>
          </button>

          <button
            onClick={onOpenLabReport}
            className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
            title="Export complete academic report for teacher/submission"
          >
            <FileText className="w-3.5 h-3.5 text-emerald-400" />
            <span className="hidden sm:inline">Export Lab Report</span>
            <span className="sm:hidden">Report</span>
          </button>

          <button
            onClick={onOpenBenchmark}
            className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
          >
            <BarChart3 className="w-3.5 h-3.5 text-sky-400" />
            Scorecard
          </button>
        </div>
      </div>

      {/* Middle Row: Playback Controls & Status Pill */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Playback Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={onToggleRun}
            className={`flex items-center gap-2 px-4 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              isRunning
                ? 'bg-amber-500 hover:bg-amber-400 text-zinc-950'
                : 'bg-emerald-500 hover:bg-emerald-400 text-zinc-950 shadow-md shadow-emerald-500/20'
            }`}
          >
            {isRunning ? (
              <>
                <Pause className="w-3.5 h-3.5 fill-current" /> Pause
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5 fill-current" /> Run Continuous
              </>
            )}
          </button>

          <button
            onClick={onStep}
            disabled={isRunning}
            className="flex items-center gap-1.5 px-3.5 py-1.5 bg-zinc-900 hover:bg-zinc-800 disabled:opacity-40 text-zinc-200 rounded-xl text-xs font-semibold border border-zinc-750 transition-colors cursor-pointer"
          >
            <SkipForward className="w-3.5 h-3.5 text-sky-400" />
            Step Tick
          </button>

          <button
            onClick={onReset}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 rounded-xl text-xs font-semibold border border-zinc-750 transition-colors cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5 text-zinc-400" />
            Reset
          </button>

          <div className="h-4 w-[1px] bg-zinc-800 mx-1" />

          {/* Quick Node/Link additions */}
          <button
            onClick={onOpenAddNode}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-200 hover:text-white rounded-xl text-xs font-semibold border border-zinc-750 transition-colors cursor-pointer group shadow-sm"
            title="Add a new custom router node to the network"
          >
            <Plus className="w-3.5 h-3.5 text-sky-400 group-hover:scale-110 transition-transform" />
            <span>+ Router</span>
          </button>

          <button
            onClick={onStartAddLink}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-200 hover:text-white rounded-xl text-xs font-semibold border border-zinc-750 transition-colors cursor-pointer group shadow-sm"
            title="Connect a physical network cable/link between any two routers"
          >
            <LinkIcon className="w-3.5 h-3.5 text-cyan-400 group-hover:scale-110 transition-transform" />
            <span>+ Link</span>
          </button>
        </div>

        {/* Speed Slider & Status Badge */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-4">
          <div className="flex items-center gap-2 text-xs text-zinc-400 bg-zinc-900 border border-zinc-800 rounded-xl px-2.5 py-1">
            <span className="text-[11px]">Speed:</span>
            <input
              type="range"
              min="100"
              max="1500"
              step="100"
              value={speedMs}
              onChange={(e) => onSetSpeed(parseInt(e.target.value, 10))}
              className="w-18 accent-sky-400 cursor-pointer h-1"
            />
            <span className="font-mono text-sky-400 w-11 text-right text-[11px] tabular-nums">
              {speedMs}ms
            </span>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 font-mono text-xs px-2.5 py-1 bg-[#121212] rounded-xl text-zinc-300 border border-[#282828] shadow-sm select-none">
              <Clock
                key={`clock-icon-${tick}`}
                className={`w-3.5 h-3.5 ${tick > 0 ? 'text-[#1ed760] transition-transform duration-300' : 'text-zinc-500'}`}
              />
              <span className="text-zinc-400">Tick:</span>
              <strong
                key={`tick-val-${tick}`}
                className="text-[#1ed760] tabular-nums font-bold animate-tick-flash inline-block"
              >
                {tick}
              </strong>
            </div>
            <div
              className={`flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-bold border transition-all ${
                isConverged
                  ? 'bg-[#121212] border-emerald-500/70 text-[#1ed760] shadow-[0_0_12px_rgba(30,215,96,0.25)] animate-completion-glow'
                  : 'bg-[#121212] border-amber-500/40 text-amber-300'
              }`}
            >
              {isConverged ? (
                <>
                  <CheckCircle className="w-3.5 h-3.5 text-[#1ed760] animate-check-snap" />
                  <span>CONVERGED</span>
                </>
              ) : (
                <>
                  <Zap className="w-3.5 h-3.5 text-amber-400" />
                  <span>CONVERGING ({inFlightCount} in-flight)</span>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Distance Vector Options Toggle Bar (when DV or DUAL is active) */}
      {(protocol === 'DV' || protocol === 'DUAL') && (
        <div className="flex flex-wrap items-center gap-6 pt-2 border-t border-zinc-800/80 text-xs text-zinc-300 bg-zinc-900/60 px-3 py-2 rounded-xl">
          <span className="text-amber-400 font-bold text-xs">
            Distance Vector Settings:
          </span>

          <label className="flex items-center gap-2 cursor-pointer hover:text-white select-none">
            <input
              type="checkbox"
              checked={dvOptions.split_horizon}
              onChange={(e) => onSetDvOptions({ split_horizon: e.target.checked })}
              className="accent-amber-500 rounded cursor-pointer"
            />
            <span>Split Horizon</span>
          </label>

          <label className="flex items-center gap-2 cursor-pointer hover:text-white select-none">
            <input
              type="checkbox"
              checked={dvOptions.poison_reverse}
              onChange={(e) => onSetDvOptions({ poison_reverse: e.target.checked })}
              className="accent-amber-500 rounded cursor-pointer"
            />
            <span>Poison Reverse</span>
          </label>

          <div className="flex items-center gap-2 sm:ml-auto">
            <span className="text-zinc-400 text-[11px]">Infinity Metric:</span>
            <select
              value={dvOptions.infinity_metric}
              onChange={(e) => onSetDvOptions({ infinity_metric: parseInt(e.target.value, 10) })}
              style={{ colorScheme: 'dark' }}
              className="bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-0.5 text-xs text-zinc-200 outline-none cursor-pointer"
            >
              <option value="16" className="bg-zinc-900 text-zinc-100">16 (RIP Standard)</option>
              <option value="32" className="bg-zinc-900 text-zinc-100">32 (Extended)</option>
              <option value="99" className="bg-zinc-900 text-zinc-100">99 (High Limit)</option>
            </select>
          </div>
        </div>
      )}

      {/* Human-readable Explainer Hint Bar */}
      <div className="flex items-center gap-2 text-[11px] text-zinc-400 bg-zinc-900/40 px-3 py-1.5 rounded-lg border border-zinc-800/60">
        <Info className="w-3.5 h-3.5 text-sky-400 flex-shrink-0" />
        <span>{explainerText}</span>
      </div>
    </div>
  );
}

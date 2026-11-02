import React, { useState, useEffect, useRef } from 'react';
import {
  Activity,
  Layers,
  Radio,
  Server,
  Zap,
  BarChart3,
  Network,
  RotateCcw,
  Sliders,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  FileText,
  AlertTriangle,
} from 'lucide-react';
import confetti from 'canvas-confetti';

import TopologyCanvas from './components/TopologyCanvas';
import ControlPanel from './components/ControlPanel';
import RoutingTableModal from './components/RoutingTableModal';
import ComparisonPanel from './components/ComparisonPanel';
import EventLogPanel from './components/EventLogPanel';
import AddNodeModal from './components/AddNodeModal';
import PacketTracerBar from './components/PacketTracerBar';
import CountToInfinityModal from './components/CountToInfinityModal';
import LabReportModal from './components/LabReportModal';

const WS_URL =
  window.location.protocol === 'https:'
    ? `wss://${window.location.host}/ws`
    : window.location.port === '5173'
    ? 'ws://localhost:8000/ws'
    : `ws://${window.location.host}/ws`;

const API_BASE =
  window.location.port === '5173' ? 'http://localhost:8000' : '';

export default function App() {
  const [state, setState] = useState(null);
  const [selectedNode, setSelectedNode] = useState(null);
  const [isAddNodeOpen, setIsAddNodeOpen] = useState(false);
  const [isMininetModalOpen, setIsMininetModalOpen] = useState(false);
  const [isAddLinkMode, setIsAddLinkMode] = useState(false);
  const [addLinkSource, setAddLinkSource] = useState(null);
  const [benchmarkData, setBenchmarkData] = useState(null);
  const [isBenchmarkOpen, setIsBenchmarkOpen] = useState(false);
  const [isCountToInfinityOpen, setIsCountToInfinityOpen] = useState(false);
  const [isLabReportOpen, setIsLabReportOpen] = useState(false);
  const [tracedPaths, setTracedPaths] = useState({ active: null, ls: null, dv: null });

  const handleSetTracedPath = (data) => {
    if (Array.isArray(data)) {
      setTracedPaths({ active: data, ls: data, dv: data });
    } else if (data && typeof data === 'object') {
      setTracedPaths({
        active: data.active || null,
        ls: data.ls || null,
        dv: data.dv || null,
      });
    } else {
      setTracedPaths({ active: null, ls: null, dv: null });
    }
  };
  const [sharedNodePositions, setSharedNodePositions] = useState(null);
  const [wsConnected, setWsConnected] = useState(false);
  const [pduTrigger, setPduTrigger] = useState(0);

  const [dvOptions, setDvOptions] = useState({
    split_horizon: true,
    poison_reverse: true,
    infinity_metric: 16,
  });

  const wsRef = useRef(null);
  const prevConvergedRef = useRef(false);

  // WebSocket Connection Lifecycle
  useEffect(() => {
    let reconnectTimeout;
    const connect = () => {
      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        setWsConnected(true);
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          setState(data);

          if (data.dv_telemetry) {
            setDvOptions({
              split_horizon: data.dv_telemetry.split_horizon ?? true,
              poison_reverse: data.dv_telemetry.poison_reverse ?? true,
              infinity_metric: data.dv_telemetry.infinity_metric ?? 16,
            });
          }

          // Trigger subtle celebration when network reaches convergence
          const isNowConverged = data.active_telemetry?.is_converged;
          if (isNowConverged && !prevConvergedRef.current && data.active_telemetry?.tick > 0) {
            confetti({
              particleCount: 25,
              spread: 60,
              origin: { y: 0.8 },
              colors: ['#06b6d4', '#10b981', '#f59e0b'],
            });
          }
          prevConvergedRef.current = isNowConverged;
        } catch (err) {
          console.error('Failed to parse websocket payload:', err);
        }
      };

      ws.onclose = () => {
        setWsConnected(false);
        reconnectTimeout = setTimeout(connect, 1500);
      };

      ws.onerror = () => {
        ws.close();
      };
    };

    connect();

    return () => {
      clearTimeout(reconnectTimeout);
      if (wsRef.current) wsRef.current.close();
    };
  }, []);

  const sendWs = (msg) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    }
  };

  // Handlers
  const handleToggleRun = () => {
    if (state?.is_running) {
      sendWs({ action: 'pause' });
    } else {
      sendWs({ action: 'run' });
    }
  };

  const handleStep = () => {
    sendWs({ action: 'step' });
  };

  const handleReset = () => {
    sendWs({ action: 'reset' });
  };

  const handleSetProtocol = (proto) => {
    sendWs({ action: 'set_protocol', protocol: proto });
  };

  const handleSetDvOptions = (opts) => {
    const updated = { ...dvOptions, ...opts };
    setDvOptions(updated);
    sendWs({ action: 'set_dv_options', ...updated });
  };

  const handleSetSpeed = (ms) => {
    sendWs({ action: 'set_speed', speed_ms: ms });
  };

  const handleLoadPreset = (preset) => {
    sendWs({ action: 'load_preset', preset });
  };

  const handleToggleLink = (u, v) => {
    sendWs({ action: 'toggle_link', u, v });
  };

  const handleSetLinkCost = (u, v, cost) => {
    sendWs({ action: 'set_link_cost', u, v, cost });
  };

  const handleAddNode = (id, label) => {
    sendWs({ action: 'add_node', id, label, x: 250, y: 200 });
  };

  const handleLinkCreated = (u, v) => {
    sendWs({ action: 'add_link', u, v, cost: 1 });
    setIsAddLinkMode(false);
    setAddLinkSource(null);
  };

  const handleRunBenchmark = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/simulation/compare`);
      const data = await res.json();
      setBenchmarkData(data);
      setIsBenchmarkOpen(true);
    } catch (e) {
      console.error('Benchmark fetch error:', e);
    }
  };

  const handlePing = async (src, dst) => {
    const res = await fetch(`${API_BASE}/api/mininet/ping`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ src, dst }),
    });
    return await res.json();
  };

  const topology = state?.topology;
  const activeTelemetry = state?.active_telemetry;
  const mininetStatus = state?.mininet_status;
  const protocol = state?.protocol || 'LS';

  const totalPackets =
    protocol === 'LS'
      ? state?.ls_telemetry?.total_control_packets ?? 0
      : protocol === 'DV'
      ? state?.dv_telemetry?.total_control_packets ?? 0
      : (state?.ls_telemetry?.total_control_packets ?? 0) +
        (state?.dv_telemetry?.total_control_packets ?? 0);

  return (
    <div className="min-h-screen bg-[#090d16] text-slate-100 flex flex-col font-sans selection:bg-cyan-500 selection:text-black">
      {/* Top Navigation / NOC Header */}
      <header className="border-b border-slate-800/80 bg-slate-950/80 backdrop-blur-xl px-6 py-3 sticky top-0 z-40 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-cyan-500/10 border border-cyan-500/30 rounded-xl text-cyan-400">
            <Network className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <h1 className="text-base font-extrabold tracking-tight text-white flex items-center gap-2">
              Routing Convergence Simulator
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-cyan-950 text-cyan-400 border border-cyan-800">
                v1.0 OSPF & RIP
              </span>
            </h1>
            <p className="text-[11px] text-slate-400">
              Interactive Link State (Dijkstra) & Distance Vector (Bellman-Ford) Convergence Engine
            </p>
          </div>
        </div>

        {/* Engine Status Indicators */}
        <div className="flex items-center gap-3 text-xs">
          {/* Mininet Engine Mode Badge */}
          <button
            onClick={() => setIsMininetModalOpen(true)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-[11px] transition-colors cursor-pointer group"
            title="Click to view Mininet Kernel Namespace runtime details"
          >
            <Server className="w-3.5 h-3.5 text-cyan-400 group-hover:animate-pulse" />
            <span className="text-slate-400">Emulator:</span>
            <span className="font-mono font-semibold text-cyan-300">
              {mininetStatus?.native_mininet_available ? 'Mininet OVS (Native)' : 'Virtual Namespaces'}
            </span>
            <HelpCircle className="w-3 h-3 text-slate-500 group-hover:text-cyan-400 ml-0.5" />
          </button>

          {/* WebSocket Link Status */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-[11px]">
            <span
              className={`w-2 h-2 rounded-full ${
                wsConnected ? 'bg-emerald-400 shadow-[0_0_8px_#10b981]' : 'bg-rose-500 animate-ping'
              }`}
            />
            <span className="text-slate-400">{wsConnected ? 'Real-Time Telemetry' : 'Reconnecting...'}</span>
          </div>
        </div>
      </header>

      {/* Main Workspace Body */}
      <main className="flex-1 p-6 max-w-[1600px] w-full mx-auto space-y-5">
        {/* Simulation Control Panel */}
        <ControlPanel
          protocol={protocol}
          mode={state?.mode || 'step'}
          isRunning={state?.is_running || false}
          speedMs={state?.speed_ms || 500}
          presetName={state?.preset_name || 'triangle'}
          activeTelemetry={activeTelemetry}
          dvOptions={dvOptions}
          onSetProtocol={handleSetProtocol}
          onSetDvOptions={handleSetDvOptions}
          onToggleRun={handleToggleRun}
          onStep={handleStep}
          onReset={handleReset}
          onSetSpeed={handleSetSpeed}
          onLoadPreset={handleLoadPreset}
          onOpenAddNode={() => setIsAddNodeOpen(true)}
          onStartAddLink={() => {
            setIsAddLinkMode(true);
            setAddLinkSource(null);
          }}
          onOpenBenchmark={handleRunBenchmark}
          onOpenCountToInfinity={() => setIsCountToInfinityOpen(true)}
          onOpenLabReport={() => setIsLabReportOpen(true)}
        />

        {/* DUAL MODE: Synchronized Side-by-Side Dual Comparison Screen */}
        {protocol === 'DUAL' ? (
          <div className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Left Canvas: Link State (OSPF / Dijkstra SPF) */}
              <div className="flex flex-col space-y-2">
                <div className="flex items-center justify-between px-3.5 py-2 bg-slate-900/90 border border-cyan-800/80 rounded-2xl text-xs backdrop-blur-md shadow-lg">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 shadow-[0_0_8px_#22d3ee]" />
                    <span className="font-bold text-cyan-300">
                      Link State (OSPF / Dijkstra SPF)
                    </span>
                  </div>
                  <div className="flex items-center gap-3 font-mono text-[11px]">
                    <span className="text-slate-400">
                      Packets: <strong className="text-cyan-300">{state?.ls_telemetry?.total_control_packets ?? 0}</strong>
                    </span>
                    <span className="text-slate-600">•</span>
                    <span className="text-slate-400">
                      Avg Hops: <strong className="text-slate-200">{state?.ls_telemetry?.avg_hop_count ?? '1.0'}</strong>
                    </span>
                  </div>
                </div>

                <TopologyCanvas
                  topology={topology}
                  activeTelemetry={state?.ls_telemetry}
                  selectedNode={selectedNode}
                  onSelectNode={(id) => setSelectedNode(id)}
                  onToggleLink={handleToggleLink}
                  onSetLinkCost={handleSetLinkCost}
                  isAddLinkMode={isAddLinkMode}
                  addLinkSource={addLinkSource}
                  onCancelAddLink={() => {
                    setIsAddLinkMode(false);
                    setAddLinkSource(null);
                  }}
                  onLinkCreated={handleLinkCreated}
                  title="OSPF (Link State)"
                  protocolType="LS"
                  tracedPath={tracedPaths.ls}
                  isCompact={true}
                  sharedPositions={sharedNodePositions}
                  onPositionsChange={setSharedNodePositions}
                  pduTrigger={pduTrigger}
                />
              </div>

              {/* Right Canvas: Distance Vector (RIP / Bellman-Ford) */}
              <div className="flex flex-col space-y-2">
                <div className="flex items-center justify-between px-3.5 py-2 bg-slate-900/90 border border-amber-800/80 rounded-2xl text-xs backdrop-blur-md shadow-lg">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-amber-400 shadow-[0_0_8px_#fbbf24]" />
                    <span className="font-bold text-amber-300">
                      Distance Vector (RIP / Bellman-Ford)
                    </span>
                  </div>
                  <div className="flex items-center gap-3 font-mono text-[11px]">
                    <span className="text-slate-400">
                      Advertisements: <strong className="text-amber-300">{state?.dv_telemetry?.total_control_packets ?? 0}</strong>
                    </span>
                    <span className="text-slate-600">•</span>
                    <span className="text-slate-400">
                      Loops: <strong className={(state?.dv_telemetry?.total_loops_detected ?? 0) > 0 ? 'text-rose-400 animate-pulse' : 'text-emerald-400'}>
                        {state?.dv_telemetry?.total_loops_detected ?? 0}
                      </strong>
                    </span>
                  </div>
                </div>

                <TopologyCanvas
                  topology={topology}
                  activeTelemetry={state?.dv_telemetry}
                  selectedNode={selectedNode}
                  onSelectNode={(id) => setSelectedNode(id)}
                  onToggleLink={handleToggleLink}
                  onSetLinkCost={handleSetLinkCost}
                  isAddLinkMode={isAddLinkMode}
                  addLinkSource={addLinkSource}
                  onCancelAddLink={() => {
                    setIsAddLinkMode(false);
                    setAddLinkSource(null);
                  }}
                  onLinkCreated={handleLinkCreated}
                  title="RIP (Distance Vector)"
                  protocolType="DV"
                  tracedPath={tracedPaths.dv}
                  isCompact={true}
                  sharedPositions={sharedNodePositions}
                  onPositionsChange={setSharedNodePositions}
                  pduTrigger={pduTrigger}
                />
              </div>
            </div>

            {/* Bottom Strip: Hop-by-Hop Packet Tracer & Unified Event Log */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
              <div className="lg:col-span-7">
                <PacketTracerBar
                  nodes={topology?.nodes || []}
                  topology={topology}
                  lsTelemetry={state?.ls_telemetry}
                  dvTelemetry={state?.dv_telemetry}
                  protocol={protocol}
                  onTracePath={handleSetTracedPath}
                  onExecutePing={handlePing}
                  onSendPacket={() => setPduTrigger((c) => c + 1)}
                  onStep={handleStep}
                  onToggleRun={handleToggleRun}
                  isRunning={state?.is_running}
                />
              </div>
              <div className="lg:col-span-5">
                <EventLogPanel logs={activeTelemetry?.recent_logs} />
              </div>
            </div>
          </div>
        ) : (
          /* SINGLE PROTOCOL MODE: Full 8-col Canvas + 4-col Telemetry */
          <div className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
              {/* Interactive Topology Graph Canvas */}
              <div className="lg:col-span-8 flex flex-col space-y-2.5">
                <div className="flex items-center justify-between px-3.5 py-2 bg-slate-900/60 border border-slate-800/80 rounded-xl text-xs">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-cyan-400" />
                    <span className="font-semibold text-slate-200">
                      Topology Mesh
                    </span>
                    <span className="text-slate-600">•</span>
                    <span className="text-slate-400 text-[11px]">
                      {topology?.nodes?.length || 0} Routers, {topology?.links?.length || 0} Links
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-slate-400 text-[11px]">Active Routing Mode:</span>
                    <span className={`font-mono text-xs font-bold ${protocol === 'LS' ? 'text-cyan-400' : 'text-amber-400'}`}>
                      {protocol === 'LS' ? 'OSPF (Link State SPF)' : 'RIP (Distance Vector)'}
                    </span>
                  </div>
                </div>

                <TopologyCanvas
                  topology={topology}
                  activeTelemetry={activeTelemetry}
                  selectedNode={selectedNode}
                  onSelectNode={(id) => setSelectedNode(id)}
                  onToggleLink={handleToggleLink}
                  onSetLinkCost={handleSetLinkCost}
                  isAddLinkMode={isAddLinkMode}
                  addLinkSource={addLinkSource}
                  onCancelAddLink={() => {
                    setIsAddLinkMode(false);
                    setAddLinkSource(null);
                  }}
                  onLinkCreated={handleLinkCreated}
                  protocolType={protocol}
                  tracedPath={protocol === 'DV' ? (tracedPaths.dv || tracedPaths.active) : (tracedPaths.ls || tracedPaths.active)}
                  pduTrigger={pduTrigger}
                />
              </div>

              {/* Right Column: Telemetry Scorecard & Event Stream */}
              <div className="lg:col-span-4 flex flex-col space-y-3.5">
                {/* Quick Metrics Card */}
                <div className="bg-[#0f172a]/95 border border-slate-800 rounded-2xl p-4 shadow-xl backdrop-blur-xl">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 font-mono mb-3 flex items-center justify-between">
                    <span>Convergence Telemetry</span>
                    <Activity className="w-4 h-4 text-cyan-400" />
                  </h3>

                  <div className="grid grid-cols-2 gap-2.5 text-xs font-mono">
                    <div className="p-3 bg-slate-900/80 rounded-xl border border-slate-800/80">
                      <div className="text-slate-400 text-[10px] uppercase font-sans">Control Packets</div>
                      <div className="text-xl font-extrabold text-cyan-300 mt-0.5 tabular-nums">{totalPackets}</div>
                      <div className="text-[10px] text-slate-500 font-sans">
                        {protocol === 'LS' ? 'LSA Floods' : 'Vector Advertisements'}
                      </div>
                    </div>

                    <div className="p-3 bg-slate-900/80 rounded-xl border border-slate-800/80">
                      <div className="text-slate-400 text-[10px] uppercase font-sans">Convergence Tick</div>
                      <div className="text-xl font-extrabold text-emerald-300 mt-0.5 tabular-nums">
                        {activeTelemetry?.convergence_tick ?? (activeTelemetry?.is_converged ? activeTelemetry?.tick : '--')}
                      </div>
                      <div className="text-[10px] text-slate-500 font-sans">
                        {activeTelemetry?.is_converged ? 'Stabilized' : 'In-Flight Changes'}
                      </div>
                    </div>

                    <div className="p-3 bg-slate-900/80 rounded-xl border border-slate-800/80">
                      <div className="text-slate-400 text-[10px] uppercase font-sans">Avg Path Hops</div>
                      <div className="text-xl font-extrabold text-slate-200 mt-0.5 tabular-nums">
                        {state?.ls_telemetry?.avg_hop_count && state.ls_telemetry.avg_hop_count > 0
                          ? `${state.ls_telemetry.avg_hop_count}`
                          : '1.0'}
                      </div>
                      <div className="text-[10px] text-slate-500 font-sans">Shortest path tree</div>
                    </div>

                    <div className="p-3 bg-slate-900/80 rounded-xl border border-slate-800/80">
                      <div className="text-slate-400 text-[10px] uppercase font-sans">Loops Detected</div>
                      <div
                        className={`text-xl font-extrabold mt-0.5 tabular-nums ${
                          (state?.dv_telemetry?.total_loops_detected ?? 0) > 0 ? 'text-rose-400 animate-pulse' : 'text-emerald-400'
                        }`}
                      >
                        {state?.dv_telemetry?.total_loops_detected ?? 0}
                      </div>
                      <div className="text-[10px] text-slate-500 font-sans">Count-to-Infinity</div>
                    </div>
                  </div>
                </div>

                {/* Event Log Stream */}
                <div className="flex-1 min-h-[280px]">
                  <EventLogPanel logs={activeTelemetry?.recent_logs} />
                </div>
              </div>
            </div>

            {/* Bottom Row: Packet Tracer Bar */}
            <PacketTracerBar
              nodes={topology?.nodes || []}
              topology={topology}
              lsTelemetry={state?.ls_telemetry}
              dvTelemetry={state?.dv_telemetry}
              protocol={protocol}
              onTracePath={handleSetTracedPath}
              onExecutePing={handlePing}
              onSendPacket={() => setPduTrigger((c) => c + 1)}
              onStep={handleStep}
              onToggleRun={handleToggleRun}
              isRunning={state?.is_running}
            />
          </div>
        )}
      </main>

      {/* Router Node Inspector Modal */}
      {selectedNode && (
        <RoutingTableModal
          nodeId={selectedNode}
          topology={topology}
          activeTelemetry={protocol === 'LS' ? state?.ls_telemetry : state?.dv_telemetry}
          protocol={protocol}
          mininetStatus={mininetStatus}
          onClose={() => setSelectedNode(null)}
          onPing={handlePing}
        />
      )}

      {/* Dual-Protocol Benchmark Comparison Modal */}
      {isBenchmarkOpen && (
        <ComparisonPanel
          benchmarkData={benchmarkData}
          onClose={() => setIsBenchmarkOpen(false)}
          onRerun={handleRunBenchmark}
        />
      )}

      {/* Count-to-Infinity Academic Lab Modal */}
      {isCountToInfinityOpen && (
        <CountToInfinityModal
          onClose={() => setIsCountToInfinityOpen(false)}
          onLoadPreset={handleLoadPreset}
          onToggleLink={handleToggleLink}
          onSetDvOptions={handleSetDvOptions}
          dvOptions={dvOptions}
          onStep={handleStep}
          topology={topology}
          activeTelemetry={state?.dv_telemetry}
        />
      )}

      {/* Academic Lab Report Modal */}
      {isLabReportOpen && (
        <LabReportModal
          onClose={() => setIsLabReportOpen(false)}
          topology={topology}
          lsTelemetry={state?.ls_telemetry}
          dvTelemetry={state?.dv_telemetry}
          mininetStatus={mininetStatus}
          protocol={protocol}
        />
      )}

      {/* Add Router Modal */}
      {isAddNodeOpen && (
        <AddNodeModal
          onClose={() => setIsAddNodeOpen(false)}
          onAddNode={handleAddNode}
          existingNodes={topology?.nodes || []}
        />
      )}

      {/* Mininet Runtime Details Modal */}
      {isMininetModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-fade-in">
          <div className="relative w-full max-w-2xl bg-[#0f172a] border border-cyan-500/40 rounded-3xl p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
              <div className="flex items-center gap-2 text-cyan-400 font-bold text-base">
                <Server className="w-5 h-5" />
                Mininet & Linux Kernel Namespace Architecture
              </div>
              <button
                onClick={() => setIsMininetModalOpen(false)}
                className="text-slate-400 hover:text-white text-sm px-2 py-1 bg-slate-800 rounded-lg"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4 text-xs text-slate-300">
              <div className="p-3 bg-slate-900/90 rounded-2xl border border-slate-800 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-200">Current Operating Mode:</span>
                  <span className={`px-2.5 py-0.5 rounded-full font-mono font-bold ${
                    mininetStatus?.native_mininet_available
                      ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                      : 'bg-cyan-950 text-cyan-400 border border-cyan-800'
                  }`}>
                    {mininetStatus?.engine_mode || 'emulated_network_namespaces'}
                  </span>
                </div>
                <div className="flex items-center justify-between text-slate-400">
                  <span>Host OS Platform:</span>
                  <span className="font-mono text-slate-200">{mininetStatus?.platform || 'Windows'}</span>
                </div>
                <div className="flex items-center justify-between text-slate-400">
                  <span>Active Router Namespaces:</span>
                  <span className="font-mono text-cyan-300 font-bold">{mininetStatus?.router_count || 0} active</span>
                </div>
              </div>

              <div className="space-y-2">
                <h4 className="font-bold text-slate-200 text-sm">Why does Mininet require a Linux Kernel?</h4>
                <p className="leading-relaxed text-slate-400">
                  Mininet is not a standalone Python simulation library; it is a wrapper around the <strong>Linux Kernel network stack</strong>. It creates real isolated network namespaces (<code className="text-cyan-400">CLONE_NEWNET</code>), Open vSwitch (<code className="text-cyan-400">ovs-vswitchd</code>) bridges, virtual ethernet (<code className="text-cyan-400">veth</code>) pairs, and programs kernel routing tables via <code className="text-cyan-400">ip route</code>.
                </p>
                <p className="leading-relaxed text-slate-400">
                  Since raw Windows does not have Linux kernel namespaces, our bridge provides high-fidelity virtual namespaces so you can simulate and test without crashing on Windows.
                </p>
              </div>

              <div className="p-3.5 bg-slate-950/80 rounded-2xl border border-cyan-900/40 space-y-2">
                <h4 className="font-bold text-cyan-300 text-xs uppercase tracking-wider">How to switch to Native Mininet OVS:</h4>
                <ol className="list-decimal list-inside space-y-1 text-slate-300 font-mono text-[11px]">
                  <li>
                    <strong className="text-white">Docker (Recommended on Windows):</strong> Install Docker Desktop and run <code className="text-cyan-400">docker compose up --build</code>. Our privileged Ubuntu container provides native Open vSwitch and Mininet!
                  </li>
                  <li>
                    <strong className="text-white">WSL2:</strong> Run <code className="text-cyan-400">wsl --install -d Ubuntu-22.04</code>, install Mininet, and run <code className="text-cyan-400">sudo python3 run_server.py</code>.
                  </li>
                  <li>
                    <strong className="text-white">Linux Server / VM:</strong> Run directly on any Ubuntu/Debian machine with <code className="text-cyan-400">sudo python3 run_server.py</code>.
                  </li>
                </ol>
              </div>
            </div>

            <div className="mt-5 flex justify-end">
              <button
                onClick={() => setIsMininetModalOpen(false)}
                className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl text-xs font-semibold shadow-md transition-colors"
              >
                Close & Return to Dashboard
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

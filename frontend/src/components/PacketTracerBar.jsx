import React, { useState } from 'react';
import {
  Navigation,
  AlertTriangle,
  ArrowRight,
  Activity,
  Clock,
  Info,
  SkipForward,
  Mail,
} from 'lucide-react';

export default function PacketTracerBar({
  nodes = [],
  topology,
  lsTelemetry,
  dvTelemetry,
  protocol = 'LS',
  onTracePath,
  onExecutePing,
  onSendPacket,
  onStep,
}) {
  const [srcNode, setSrcNode] = useState(nodes[0]?.id || 'A');
  const [dstNode, setDstNode] = useState(nodes[nodes.length - 1]?.id || 'C');
  const [traceResult, setTraceResult] = useState(null);
  const [isPinging, setIsPinging] = useState(false);
  const [pingLog, setPingLog] = useState(null);

  // Keep src/dst valid if topology changes
  React.useEffect(() => {
    if (nodes.length > 0) {
      if (!nodes.some((n) => n.id === srcNode)) setSrcNode(nodes[0].id);
      if (!nodes.some((n) => n.id === dstNode)) setDstNode(nodes[nodes.length - 1].id);
    }
  }, [nodes]);

  // Automatically trace and update round-trip packet animation path whenever nodes, protocol, or telemetry changes
  React.useEffect(() => {
    handleTrace();
  }, [srcNode, dstNode, protocol, lsTelemetry?.tick, dvTelemetry?.tick, topology?.name]);

  const handleTrace = () => {
    if (!srcNode || !dstNode) return;

    // Check if directly connected by an active physical link
    const directLink = (topology?.links || []).find(
      (l) =>
        ((l.u === srcNode && l.v === dstNode) || (l.v === srcNode && l.u === dstNode)) &&
        l.status === 'up'
    );

    // 1. Link State (OSPF) Path
    const lsTable = lsTelemetry?.routing_tables?.[srcNode] || {};
    const lsEntry = lsTable[dstNode];
    let lsCost = lsEntry?.cost;
    let lsPath = lsEntry?.path || (srcNode === dstNode ? [srcNode] : []);
    let lsReachable = lsCost !== undefined && lsCost < 16;

    // If direct physical cable is UP, it is immediately reachable at Layer 2/3
    if (!lsReachable && directLink) {
      lsCost = directLink.cost;
      lsPath = [srcNode, dstNode];
      lsReachable = true;
    }

    let lsStatus = 'reachable';
    if (srcNode === dstNode) {
      lsStatus = 'same_node';
    } else if (!lsReachable) {
      if (protocol === 'DV' && (lsTelemetry?.tick ?? 0) === 0) {
        lsStatus = 'paused_mode';
      } else if (!lsTelemetry?.is_converged && (lsTelemetry?.tick ?? 0) === 0) {
        lsStatus = 'in_flight';
      } else {
        lsStatus = 'severed';
      }
    }

    // 2. Distance Vector (RIP) Path Trace
    const dvTable = dvTelemetry?.routing_tables || {};
    let dvPath = [srcNode];
    let curr = srcNode;
    let dvCost = dvTable[srcNode]?.[dstNode]?.cost;
    let hasLoop = false;
    let visited = new Set([srcNode]);
    let maxHops = 16;

    while (curr !== dstNode && maxHops > 0) {
      maxHops--;
      const entry = dvTable[curr]?.[dstNode];
      if (!entry || entry.cost >= 16 || !entry.next_hop) {
        if (directLink && curr === srcNode) {
          dvPath.push(dstNode);
          dvCost = directLink.cost;
        } else {
          dvPath.push('(Unreachable)');
        }
        break;
      }
      const nextHop = entry.next_hop;
      if (visited.has(nextHop)) {
        dvPath.push(nextHop);
        dvPath.push('(Loop!)');
        hasLoop = true;
        break;
      }
      dvPath.push(nextHop);
      visited.add(nextHop);
      curr = nextHop;
    }

    const dvReachable = (dvCost !== undefined && dvCost < 16 && !hasLoop) || Boolean(directLink);

    let dvStatus = 'reachable';
    if (srcNode === dstNode) {
      dvStatus = 'same_node';
    } else if (hasLoop) {
      dvStatus = 'loop';
    } else if (!dvReachable) {
      if (protocol === 'LS' && (dvTelemetry?.tick ?? 0) === 0) {
        dvStatus = 'paused_mode';
      } else if (!dvTelemetry?.is_converged && (dvTelemetry?.tick ?? 0) === 0) {
        dvStatus = 'in_flight';
      } else {
        dvStatus = 'severed';
      }
    }

    const result = {
      src: srcNode,
      dst: dstNode,
      ls: {
        reachable: lsReachable,
        status: lsStatus,
        cost: lsCost,
        path: lsPath,
      },
      dv: {
        reachable: dvReachable,
        status: dvStatus,
        cost: dvCost,
        path: dvPath,
        hasLoop,
      },
    };

    setTraceResult(result);
    setPingLog(null);

    // Clean protocol paths for independent canvas display
    const cleanLsPath = lsReachable ? lsPath : null;
    const cleanDvPath = dvReachable ? dvPath.filter((n) => !n.startsWith('(')) : null;
    const activePath = protocol === 'DV' ? cleanDvPath : cleanLsPath;

    if (onTracePath) {
      onTracePath({
        active: activePath,
        ls: cleanLsPath,
        dv: cleanDvPath,
      });
    }
  };

  const handlePing = async () => {
    if (!srcNode || !dstNode || !onExecutePing) return;
    setIsPinging(true);
    setPingLog(null);
    try {
      const res = await onExecutePing(srcNode, dstNode);
      setPingLog(
        res?.output || (res?.success ? 'ICMP Echo Succeeded: 0% packet loss' : 'ICMP Echo Failed: 100% loss')
      );
    } catch (err) {
      setPingLog(`Error: ${err.message}`);
    } finally {
      setIsPinging(false);
    }
  };

  return (
    <div className="bg-[var(--bg-card)] border border-[var(--border-card)] rounded-2xl p-3 sm:p-4 shadow-xl backdrop-blur-xl h-full flex flex-col justify-between gap-3 transition-colors">
      {/* Title & Controls Row */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-emerald-400">
            <Navigation className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-xs font-bold text-slate-200">
              Hop-by-Hop Packet Route Tracer
            </h3>
            <p className="text-[10px] text-slate-400">
              Simulate forwarding along SPF (OSPF) vs Bellman-Ford (RIP) next-hop vectors
            </p>
          </div>
        </div>

        {/* Source & Destination Selectors */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <div className="flex items-center gap-1.5 bg-slate-900 border border-slate-750 px-2.5 py-1 rounded-xl">
            <span className="text-[11px] text-slate-400">Source:</span>
            <select
              value={srcNode}
              onChange={(e) => setSrcNode(e.target.value)}
              style={{ colorScheme: 'dark' }}
              className="bg-zinc-900 text-cyan-300 font-mono font-bold outline-none cursor-pointer text-xs"
            >
              {nodes.map((n) => (
                <option key={n.id} value={n.id} className="bg-zinc-900 text-zinc-100">
                  Router {n.id}
                </option>
              ))}
            </select>
          </div>

          <ArrowRight className="w-3.5 h-3.5 text-slate-500" />

          <div className="flex items-center gap-1.5 bg-slate-900 border border-slate-750 px-2.5 py-1 rounded-xl">
            <span className="text-[11px] text-slate-400">Destination:</span>
            <select
              value={dstNode}
              onChange={(e) => setDstNode(e.target.value)}
              style={{ colorScheme: 'dark' }}
              className="bg-zinc-900 text-cyan-300 font-mono font-bold outline-none cursor-pointer text-xs"
            >
              {nodes.map((n) => (
                <option key={n.id} value={n.id} className="bg-zinc-900 text-zinc-100">
                  Router {n.id}
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={() => {
              handleTrace();
              if (onSendPacket) onSendPacket();
            }}
            className="flex items-center gap-1.5 px-3.5 py-1 bg-emerald-500 hover:bg-emerald-400 text-zinc-950 rounded-xl text-xs font-bold shadow-md shadow-emerald-500/20 transition-colors cursor-pointer"
            title="Send Cisco Packet Tracer ICMP PDU envelope along computed route"
          >
            <Mail className="w-3.5 h-3.5 fill-current" />
            Send Packet (PDU)
          </button>

          <button
            onClick={async () => {
              handleTrace();
              if (onSendPacket) onSendPacket();
              await handlePing();
            }}
            disabled={isPinging}
            className="flex items-center gap-1.5 px-3 py-1 bg-sky-500/20 hover:bg-sky-500/30 text-sky-300 border border-sky-500/40 rounded-xl text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50"
            title="Send live Linux kernel ICMP Echo between Mininet namespaces"
          >
            <Activity className="w-3.5 h-3.5 text-sky-400" />
            {isPinging ? 'Pinging...' : 'Mininet ICMP Ping'}
          </button>
        </div>
      </div>

      {/* Results Comparison Grid */}
      {traceResult && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2 border-t border-zinc-800/80 flex-1">
          {/* Link State (OSPF) Path */}
          <div className="p-3 bg-zinc-900/80 rounded-xl border border-cyan-900/60 text-xs flex flex-col justify-between gap-2">
            <div className="flex items-center justify-between border-b border-slate-800 pb-1">
              <span className="font-bold text-cyan-300 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-cyan-400" />
                OSPF (Dijkstra SPF)
              </span>
              <span className="font-mono text-[11px] text-cyan-400 font-semibold">
                {traceResult.ls.status === 'in_flight'
                  ? 'In-Flight (Tick 0)'
                  : traceResult.ls.status === 'paused_mode'
                  ? 'Paused (DV Active)'
                  : `Metric: ${traceResult.ls.cost ?? '∞'}`}
              </span>
            </div>

            <div className="flex items-center gap-1.5 flex-wrap font-mono text-[11px]">
              <span className="text-slate-400">Path:</span>
              {traceResult.ls.reachable && traceResult.ls.path.length > 0 ? (
                traceResult.ls.path.map((hop, idx) => (
                  <React.Fragment key={idx}>
                    <span className="px-1.5 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-800 font-bold">
                      {hop}
                    </span>
                    {idx < traceResult.ls.path.length - 1 && <span className="text-slate-600">→</span>}
                  </React.Fragment>
                ))
              ) : traceResult.ls.status === 'in_flight' ? (
                <div className="flex items-center gap-2 text-amber-300 font-sans">
                  <Clock className="w-3.5 h-3.5 text-amber-400 animate-spin" />
                  <span>Tick 0: LSAs in-flight. Advance simulation to converge!</span>
                  {onStep && (
                    <button
                      onClick={onStep}
                      className="px-2 py-0.5 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 rounded text-[10px] font-semibold transition-colors cursor-pointer flex items-center gap-1"
                    >
                      <SkipForward className="w-3 h-3" /> Step Tick
                    </button>
                  )}
                </div>
              ) : traceResult.ls.status === 'paused_mode' ? (
                <span className="text-slate-400 flex items-center gap-1 font-sans">
                  <Info className="w-3 h-3 text-slate-400" />
                  Paused in DV mode (Switch to OSPF or Dual Comparison to run)
                </span>
              ) : (
                <span className="text-rose-400 flex items-center gap-1 font-sans">
                  <AlertTriangle className="w-3 h-3" /> Destination Unreachable (Cost ≥ 16)
                </span>
              )}
            </div>
          </div>

          {/* Distance Vector (RIP) Path */}
          <div className="p-3 bg-zinc-900/80 rounded-xl border border-amber-900/60 text-xs flex flex-col justify-between gap-2">
            <div className="flex items-center justify-between border-b border-slate-800 pb-1">
              <span className="font-bold text-amber-300 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-amber-400" />
                RIP (Distance Vector)
              </span>
              <span
                className={`font-mono text-[11px] font-semibold ${
                  traceResult.dv.status === 'in_flight'
                    ? 'text-amber-400'
                    : traceResult.dv.cost >= 16
                    ? 'text-rose-400'
                    : 'text-amber-400'
                }`}
              >
                {traceResult.dv.status === 'in_flight'
                  ? 'In-Flight (Tick 0)'
                  : traceResult.dv.status === 'paused_mode'
                  ? 'Paused (OSPF Active)'
                  : traceResult.dv.cost >= 16
                  ? '16 (Infinity)'
                  : `Metric: ${traceResult.dv.cost ?? '∞'}`}
              </span>
            </div>

            <div className="flex items-center gap-1.5 flex-wrap font-mono text-[11px]">
              <span className="text-slate-400">Path:</span>
              {traceResult.dv.hasLoop ? (
                <span className="text-rose-400 flex items-center gap-1 font-sans font-bold">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  Routing Loop: {traceResult.dv.path.join(' → ')}
                </span>
              ) : traceResult.dv.reachable ? (
                traceResult.dv.path.map((hop, idx) => (
                  <React.Fragment key={idx}>
                    <span className="px-1.5 py-0.5 rounded bg-amber-950 text-amber-300 border border-amber-800 font-bold">
                      {hop}
                    </span>
                    {idx < traceResult.dv.path.length - 1 && <span className="text-slate-600">→</span>}
                  </React.Fragment>
                ))
              ) : traceResult.dv.status === 'in_flight' ? (
                <div className="flex items-center gap-2 text-amber-300 font-sans">
                  <Clock className="w-3.5 h-3.5 text-amber-400 animate-spin" />
                  <span>Tick 0: Vectors in-flight. Advance simulation to converge!</span>
                  {onStep && (
                    <button
                      onClick={onStep}
                      className="px-2 py-0.5 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 rounded text-[10px] font-semibold transition-colors cursor-pointer flex items-center gap-1"
                    >
                      <SkipForward className="w-3 h-3" /> Step Tick
                    </button>
                  )}
                </div>
              ) : traceResult.dv.status === 'paused_mode' ? (
                <span className="text-slate-400 flex items-center gap-1 font-sans">
                  <Info className="w-3 h-3 text-slate-400" />
                  Paused in OSPF mode (Switch to RIP or Dual Comparison to run)
                </span>
              ) : (
                <span className="text-rose-400 flex items-center gap-1 font-sans">
                  <AlertTriangle className="w-3 h-3" /> Destination Unreachable (Cost ≥ 16)
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Mininet Real Kernel Ping Log */}
      {pingLog && (
        <div className="p-3 bg-black/90 border border-slate-750 rounded-xl space-y-1.5 animate-fade-in font-mono text-xs shadow-2xl">
          <div className="flex items-center justify-between text-slate-400 border-b border-slate-800/80 pb-1.5 text-[11px]">
            <div className="flex items-center gap-1.5">
              <div className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full bg-rose-500/80 inline-block" />
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500/80 inline-block" />
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500/80 inline-block" />
              </div>
              <span className="ml-2 font-semibold text-slate-300">Mininet Real Data-Plane Terminal</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded bg-cyan-950 text-cyan-300 border border-cyan-800 font-mono">
                Linux veth & OVS
              </span>
            </div>
            <button
              onClick={() => setPingLog(null)}
              className="text-[10px] text-slate-400 hover:text-white px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 transition-colors cursor-pointer"
            >
              Clear
            </button>
          </div>
          <pre className="text-emerald-400 whitespace-pre-wrap leading-relaxed pt-1 overflow-x-auto text-[11px] font-mono">{pingLog}</pre>
        </div>
      )}
    </div>
  );
}

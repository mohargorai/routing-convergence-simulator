import React, { useState } from 'react';
import { X, Network, Database, Send, AlertOctagon, CheckCircle2, Radio, Server, Clock } from 'lucide-react';

export default function RoutingTableModal({
  nodeId,
  topology,
  activeTelemetry,
  protocol,
  mininetStatus,
  onClose,
  onPing,
}) {
  const [activeTab, setActiveTab] = useState('routes');
  const [pingTarget, setPingTarget] = useState('');
  const [pingResult, setPingResult] = useState(null);
  const [pingLoading, setPingLoading] = useState(false);

  if (!nodeId) return null;

  const node = topology?.nodes?.find((n) => n.id === nodeId);
  const routingTable = activeTelemetry?.routing_tables?.[nodeId] || {};
  const lsdb = activeTelemetry?.lsdbs?.[nodeId] || {};
  const neighborVectors = activeTelemetry?.neighbor_vectors?.[nodeId] || {};

  const otherNodes = topology?.nodes?.filter((n) => n.id !== nodeId && n.status === 'up') || [];

  const getNodeIp = (id) => {
    if (!id) return '10.0.0.1';
    const clean = String(id).trim().toUpperCase();
    if (!isNaN(clean)) return `10.0.0.${clean}`;
    if (clean.length === 1 && clean >= 'A' && clean <= 'Z') {
      return `10.0.0.${clean.charCodeAt(0) - 64}`;
    }
    return `10.0.0.${(clean.charCodeAt(0) % 250) + 1}`;
  };

  const handleExecutePing = async () => {
    if (!pingTarget) return;
    setPingLoading(true);
    setPingResult(null);
    try {
      const res = await onPing(nodeId, pingTarget);
      setPingResult(res);
    } catch (e) {
      setPingResult({ success: false, error: String(e) });
    } finally {
      setPingLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-2xl bg-[#12131a] border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800 bg-zinc-900/60">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-sky-500/10 border border-sky-500/30 rounded-xl text-sky-400">
              <Server className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-bold text-zinc-100 font-mono">
                  {node?.label || `Router ${nodeId}`}
                </h3>
                <span className="px-2 py-0.5 text-[11px] font-mono rounded bg-zinc-800 text-sky-400 border border-zinc-700">
                  IP: {getNodeIp(nodeId)}/24
                </span>
                <span
                  className={`px-2 py-0.5 text-[11px] font-semibold rounded ${
                    node?.status === 'up'
                      ? 'bg-emerald-950/60 text-emerald-400 border border-emerald-800'
                      : 'bg-rose-950/60 text-rose-400 border border-rose-800'
                  }`}
                >
                  {node?.status === 'up' ? 'ONLINE' : 'OFFLINE'}
                </span>
              </div>
              <p className="text-xs text-zinc-400">
                Namespace: <span className="text-zinc-300 font-mono">r_{nodeId}</span> • Engine Mode:{' '}
                <span className="text-sky-400 font-mono">{mininetStatus?.engine_mode || 'emulated'}</span>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="flex border-b border-zinc-800 bg-zinc-900/30 px-6 pt-2">
          <button
            onClick={() => setActiveTab('routes')}
            className={`flex items-center gap-2 pb-2.5 px-3 text-xs font-semibold border-b-2 transition-colors cursor-pointer ${
              activeTab === 'routes'
                ? 'border-sky-400 text-sky-400'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Network className="w-4 h-4" />
            Routing Table ({Object.keys(routingTable).length})
          </button>
          <button
            onClick={() => setActiveTab('protocol_data')}
            className={`flex items-center gap-2 pb-2.5 px-3 text-xs font-semibold border-b-2 transition-colors cursor-pointer ${
              activeTab === 'protocol_data'
                ? 'border-sky-400 text-sky-400'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Database className="w-4 h-4" />
            {protocol === 'LS' ? 'Link State Database (LSDB)' : 'Neighbor Distance Vectors'}
          </button>
          <button
            onClick={() => setActiveTab('ping')}
            className={`flex items-center gap-2 pb-2.5 px-3 text-xs font-semibold border-b-2 transition-colors cursor-pointer ${
              activeTab === 'ping'
                ? 'border-sky-400 text-sky-400'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Radio className="w-4 h-4" />
            Mininet Data-Plane Ping
          </button>
        </div>

        {/* Tab Content */}
        <div className="p-6 max-h-[380px] overflow-y-auto">
          {activeTab === 'routes' && (
            <div className="space-y-3">
              <table className="w-full text-left text-xs font-mono">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400">
                    <th className="pb-2">Destination</th>
                    <th className="pb-2">Metric / Cost</th>
                    <th className="pb-2">Next Hop</th>
                    <th className="pb-2">Path / Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-slate-200">
                  {Object.entries(routingTable).map(([dest, entry]) => {
                    const cost = entry.cost;
                    const isUnreachable = cost >= 16;
                    const isLoop = entry.loop_detected;

                    return (
                      <tr key={dest} className="hover:bg-slate-800/30">
                        <td className="py-2.5 font-bold flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-cyan-400" />
                          Router {dest}
                          {dest === nodeId && <span className="text-[10px] text-slate-500 font-normal">(self)</span>}
                        </td>
                        <td className="py-2.5">
                          <span
                            className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                              isUnreachable
                                ? 'bg-rose-950/80 text-rose-400 border border-rose-800'
                                : 'bg-slate-800 text-cyan-300'
                            }`}
                          >
                            {isUnreachable ? '∞ (16+)' : cost}
                          </span>
                        </td>
                        <td className="py-2.5">
                          {entry.next_hop ? (
                            <span className="text-slate-300">
                              via <span className="font-bold text-cyan-400">{entry.next_hop}</span>
                            </span>
                          ) : (
                            <span className="text-rose-400 italic">None (Drop)</span>
                          )}
                        </td>
                        <td className="py-2.5">
                          {isLoop ? (
                            <span className="flex items-center gap-1 text-rose-400 font-bold animate-pulse">
                              <AlertOctagon className="w-3.5 h-3.5" />
                              LOOP DETECTED
                            </span>
                          ) : entry.path ? (
                            <span className="text-slate-400 text-[11px]">{entry.path.join(' → ')}</span>
                          ) : isUnreachable ? (
                            <span className="text-slate-500">Unreachable</span>
                          ) : (
                            <span className="flex items-center gap-1 text-emerald-400">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              Active Forwarding
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {Object.keys(routingTable).length === 0 && (
                    <tr>
                      <td colSpan="4" className="text-center py-6 text-slate-500">
                        No route entries computed yet. Advance simulation tick to populate.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {activeTab === 'protocol_data' && (
            <div>
              {protocol === 'LS' ? (
                <div className="space-y-3">
                  <p className="text-xs text-slate-400 mb-2">
                    Synchronized Link State Database (LSDB) populated via reliable LSA flooding:
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    {Object.entries(lsdb).map(([adv, lsa]) => (
                      <div
                        key={adv}
                        className="p-3 bg-slate-900/80 border border-slate-800 rounded-xl space-y-1 text-xs"
                      >
                        <div className="flex items-center justify-between border-b border-slate-800/80 pb-1">
                          <span className="font-bold text-cyan-300 font-mono">Router {adv}</span>
                          <span className="text-[10px] bg-slate-800 px-1.5 py-0.5 rounded text-slate-300 font-mono">
                            Seq #{lsa.seq_num}
                          </span>
                        </div>
                        <div className="pt-1 text-slate-400 text-[11px]">
                          Advertised Links:
                          <ul className="mt-1 space-y-0.5 text-slate-300 font-mono">
                            {Object.entries(lsa.links || {}).map(([nbr, cost]) => (
                              <li key={nbr} className="flex justify-between">
                                <span>to {nbr}:</span>
                                <span className="text-cyan-400 font-bold">{cost}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-xs text-slate-400 mb-2">
                    Direct distance vectors advertised by adjacent neighbors:
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    {Object.entries(neighborVectors).map(([nbr, vec]) => (
                      <div
                        key={nbr}
                        className="p-3 bg-slate-900/80 border border-slate-800 rounded-xl space-y-1 text-xs"
                      >
                        <div className="flex items-center justify-between border-b border-slate-800/80 pb-1">
                          <span className="font-bold text-amber-300 font-mono">From Router {nbr}</span>
                        </div>
                        <ul className="mt-1 space-y-0.5 text-slate-300 font-mono text-[11px]">
                          {Object.entries(vec || {}).map(([dst, cost]) => (
                            <li key={dst} className="flex justify-between">
                              <span>dest {dst}:</span>
                              <span className={cost >= 16 ? 'text-rose-400 font-bold' : 'text-amber-400 font-bold'}>
                                {cost >= 16 ? '16 (Poison)' : cost}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                    {Object.keys(neighborVectors).length === 0 && (
                      <p className="text-slate-500 text-xs italic col-span-2">
                        No neighbor vectors received yet.
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'ping' && (() => {
            const isTargetDirectNeighbor = (topology?.links || []).some(
              (l) =>
                ((l.u === nodeId && l.v === pingTarget) || (l.v === nodeId && l.u === pingTarget)) &&
                l.status === 'up'
            );
            const isAtTick0 = (activeTelemetry?.tick ?? 0) === 0 && !activeTelemetry?.is_converged;

            return (
              <div className="space-y-4">
                <p className="text-xs text-zinc-400">
                  Execute a real ICMP ping between Mininet router network namespaces:
                </p>
                <div className="flex items-center gap-3">
                  <div className="text-xs font-mono text-sky-400">From: r_{nodeId}</div>
                  <span className="text-zinc-500">→</span>
                  <select
                    value={pingTarget}
                    onChange={(e) => setPingTarget(e.target.value)}
                    style={{ colorScheme: 'dark' }}
                    className="bg-zinc-900 border border-zinc-750 rounded-lg px-3 py-1.5 text-xs text-zinc-100 outline-none focus:border-sky-400 cursor-pointer"
                  >
                    <option value="" className="bg-zinc-900 text-zinc-400">Select Target Router...</option>
                    {otherNodes.map((n) => (
                      <option key={n.id} value={n.id} className="bg-zinc-900 text-zinc-100">
                        Router {n.id} ({getNodeIp(n.id)})
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={handleExecutePing}
                    disabled={!pingTarget || pingLoading}
                    className="flex items-center gap-1.5 px-4 py-1.5 bg-sky-500 hover:bg-sky-400 disabled:opacity-50 text-zinc-950 text-xs font-bold rounded-lg shadow transition-colors cursor-pointer"
                  >
                    <Send className="w-3.5 h-3.5" />
                    {pingLoading ? 'Transmitting...' : 'Send ICMP Echo'}
                  </button>
                </div>

                {pingTarget && !isTargetDirectNeighbor && isAtTick0 && (
                  <div className="flex items-center gap-2 p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs">
                    <Clock className="w-4 h-4 text-amber-400 shrink-0" />
                    <span>
                      Router {pingTarget} is multi-hop. At <strong>Tick 0</strong>, control packets are in-flight. Click <strong>Step Tick (⏭)</strong> or <strong>Run (▶)</strong> on the dashboard to converge routes before pinging!
                    </span>
                  </div>
                )}

                {pingResult && (
                  <div
                    className={`p-3 rounded-xl border text-xs font-mono whitespace-pre-wrap leading-relaxed ${
                      pingResult.success
                        ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-300'
                        : 'bg-rose-950/40 border-rose-500/40 text-rose-300'
                    }`}
                  >
                    {pingResult.output || pingResult.error}
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      </div>
    </div>
  );
}


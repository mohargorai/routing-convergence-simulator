import React, { useState, useRef, useEffect } from 'react';
import { Activity, Zap, Eye, EyeOff, CheckCircle2, Mail, XCircle } from 'lucide-react';

export default function TopologyCanvas({
  topology,
  activeTelemetry,
  selectedNode,
  onSelectNode,
  onToggleLink,
  onSetLinkCost,
  isAddLinkMode,
  addLinkSource,
  onCancelAddLink,
  onLinkCreated,
  title,
  protocolType = 'LS',
  tracedPath = null,
  isCompact = false,
  sharedPositions = null,
  onPositionsChange = null,
  pduTrigger = 0,
}) {
  const svgRef = useRef(null);
  const [draggingNode, setDraggingNode] = useState(null);
  const [internalPositions, setInternalPositions] = useState({});
  const [editingLink, setEditingLink] = useState(null);
  const [newCost, setNewCost] = useState('1');
  const [showPackets, setShowPackets] = useState(true);
  const [pduState, setPduState] = useState(null);
  const [localTrigger, setLocalTrigger] = useState(0);

  // Synchronize positions whenever topology preset or nodes change to avoid overlapping
  useEffect(() => {
    if (!topology || !topology.nodes) return;
    const initial = {};
    topology.nodes.forEach((node) => {
      // If compact (dual view), scale x slightly inwards
      const scaleX = isCompact ? 0.8 : 1.0;
      const offsetX = isCompact ? 35 : 0;
      initial[node.id] = {
        x: Math.round((node.x || 360) * scaleX + offsetX),
        y: node.y || 240,
      };
    });
    setInternalPositions(initial);
    if (onPositionsChange) onPositionsChange(initial);
  }, [topology?.name, topology?.nodes?.length, isCompact]);

  const nodePositions = sharedPositions || internalPositions;

  // Cisco Packet Tracer Style Simulation: Explicit Triggered Round-Trip (Only on user click!)
  useEffect(() => {
    // Only run if user explicitly triggered via Send PDU / Send Packet
    if (!tracedPath || tracedPath.length < 2 || (pduTrigger === 0 && localTrigger === 0)) {
      setPduState(null);
      return;
    }

    const hasPositions = tracedPath.every((id) => nodePositions[id]);
    if (!hasPositions) {
      setPduState(null);
      return;
    }

    let animFrameId = null;
    let dismissTimer = null;
    let startTime = null;

    // Check link status along the forward path
    const links = topology?.links || {};
    const isLinkUp = (u, v) => {
      const l = Object.values(links).find(
        (lnk) => (lnk.u === u && lnk.v === v) || (lnk.v === u && lnk.u === v)
      );
      return l && l.status === 'up';
    };

    let dropAtIndex = -1;
    for (let i = 0; i < tracedPath.length - 1; i++) {
      if (!isLinkUp(tracedPath[i], tracedPath[i + 1])) {
        dropAtIndex = i;
        break;
      }
    }

    const segments = [];
    if (dropAtIndex !== -1) {
      for (let i = 0; i < dropAtIndex; i++) {
        segments.push({ from: tracedPath[i], to: tracedPath[i + 1], isReply: false });
      }
    } else {
      // Forward segments (Echo Request: Source -> Destination)
      for (let i = 0; i < tracedPath.length - 1; i++) {
        segments.push({ from: tracedPath[i], to: tracedPath[i + 1], isReply: false });
      }
      // Return segments (Echo Reply: Destination -> Source)
      for (let i = tracedPath.length - 1; i > 0; i--) {
        segments.push({ from: tracedPath[i], to: tracedPath[i - 1], isReply: true });
      }
    }

    if (segments.length === 0 && dropAtIndex === 0) {
      const srcPos = nodePositions[tracedPath[0]];
      setPduState({
        phase: 'dropped',
        dropNode: tracedPath[0],
        pos: srcPos,
        angle: 0,
        isReply: false,
        statusText: `Dropped at Router ${tracedPath[0]} (Wire to ${tracedPath[1]} is Down)`,
      });
      return;
    }

    const SEGMENT_DURATION = 850; // ms per hop
    const totalDuration = segments.length * SEGMENT_DURATION;

    const animate = (timestamp) => {
      if (!startTime) startTime = timestamp;
      const elapsed = timestamp - startTime;

      if (elapsed >= totalDuration) {
        if (dropAtIndex !== -1) {
          const dropNodeId = tracedPath[dropAtIndex];
          const dropPos = nodePositions[dropNodeId];
          setPduState({
            phase: 'dropped',
            dropNode: dropNodeId,
            pos: dropPos,
            angle: 0,
            isReply: false,
            statusText: `Packet Dropped at Router ${dropNodeId} (Link to ${tracedPath[dropAtIndex + 1]} is Down)`,
          });
          dismissTimer = setTimeout(() => setPduState(null), 3000);
        } else {
          const srcPos = nodePositions[tracedPath[0]];
          setPduState({
            phase: 'completed',
            dropNode: null,
            pos: srcPos,
            angle: 0,
            isReply: true,
            statusText: `Successful (ICMP Echo Reply received at Router ${tracedPath[0]})`,
          });
          dismissTimer = setTimeout(() => setPduState(null), 3000);
        }
        return; // STOPS HERE! ZERO LOOPING!
      }

      const segIndex = Math.min(
        Math.floor(elapsed / SEGMENT_DURATION),
        segments.length - 1
      );
      const segProgress = (elapsed % SEGMENT_DURATION) / SEGMENT_DURATION;
      const seg = segments[segIndex];
      const p1 = nodePositions[seg.from];
      const p2 = nodePositions[seg.to];

      if (p1 && p2) {
        const curX = p1.x + (p2.x - p1.x) * segProgress;
        const curY = p1.y + (p2.y - p1.y) * segProgress;
        const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x) * (180 / Math.PI);

        setPduState({
          phase: seg.isReply ? 'reply' : 'forward',
          dropNode: null,
          pos: { x: curX, y: curY },
          angle: angle,
          isReply: seg.isReply,
          currentHop: `${seg.from} ➔ ${seg.to}`,
          statusText: seg.isReply
            ? `Echo Reply: Router ${seg.from} ➔ Router ${seg.to}`
            : `Echo Request: Router ${seg.from} ➔ Router ${seg.to}`,
        });
      }

      animFrameId = requestAnimationFrame(animate);
    };

    animFrameId = requestAnimationFrame(animate);

    return () => {
      if (animFrameId) cancelAnimationFrame(animFrameId);
      if (dismissTimer) clearTimeout(dismissTimer);
    };
  }, [
    tracedPath,
    topology?.links,
    topology?.version,
    nodePositions,
    pduTrigger,
    localTrigger,
  ]);

  const getNodeIp = (id) => {
    if (!id) return '10.0.0.1';
    const clean = String(id).trim().toUpperCase();
    if (!isNaN(clean)) return `10.0.0.${clean}`;
    if (clean.length === 1 && clean >= 'A' && clean <= 'Z') {
      return `10.0.0.${clean.charCodeAt(0) - 64}`;
    }
    return `10.0.0.${(clean.charCodeAt(0) % 250) + 1}`;
  };

  const getSvgCoordinates = (clientX, clientY) => {
    if (!svgRef.current) return null;
    const svg = svgRef.current;
    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return null;
    return pt.matrixTransform(ctm.inverse());
  };

  const handleMouseDown = (nodeId, e) => {
    e.stopPropagation();
    if (isAddLinkMode) {
      if (!addLinkSource) {
        onSelectNode(nodeId);
      } else if (addLinkSource !== nodeId) {
        onLinkCreated(addLinkSource, nodeId);
      }
      return;
    }
    setDraggingNode(nodeId);
    onSelectNode(nodeId);
  };

  const handleTouchStart = (nodeId, e) => {
    if (!e.touches || e.touches.length === 0) return;
    e.stopPropagation();
    if (isAddLinkMode) {
      if (!addLinkSource) {
        onSelectNode(nodeId);
      } else if (addLinkSource !== nodeId) {
        onLinkCreated(addLinkSource, nodeId);
      }
      return;
    }
    setDraggingNode(nodeId);
    onSelectNode(nodeId);
  };

  const updateNodePositionFromCoords = (clientX, clientY) => {
    if (!draggingNode || !svgRef.current) return;
    const coords = getSvgCoordinates(clientX, clientY);
    if (!coords) return;
    const maxX = isCompact ? 620 : 670;
    const maxY = isCompact ? 415 : 435;
    const x = Math.round(Math.max(45, Math.min(maxX, coords.x)));
    const y = Math.round(Math.max(45, Math.min(maxY, coords.y)));

    const updated = {
      ...nodePositions,
      [draggingNode]: { x, y },
    };
    if (onPositionsChange) {
      onPositionsChange(updated);
    } else {
      setInternalPositions(updated);
    }
  };

  const handleMouseMove = (e) => {
    updateNodePositionFromCoords(e.clientX, e.clientY);
  };

  const handleTouchMove = (e) => {
    if (!draggingNode || !e.touches || e.touches.length === 0) return;
    updateNodePositionFromCoords(e.touches[0].clientX, e.touches[0].clientY);
  };

  const handleMouseUp = () => {
    setDraggingNode(null);
  };

  const sptEdges = activeTelemetry?.spt_edges?.[selectedNode] || [];
  const inFlightPackets = activeTelemetry?.in_flight_packets || [];
  const isConverged = activeTelemetry?.is_converged;
  const tick = activeTelemetry?.tick ?? 0;

  const handleCostSubmit = (e, u, v) => {
    e.preventDefault();
    const c = parseInt(newCost, 10);
    if (!isNaN(c) && c >= 1) {
      onSetLinkCost(u, v, c);
      setEditingLink(null);
    }
  };

  // Helper to check if link (u, v) is in tracedPath
  const isLinkInTracedPath = (u, v) => {
    if (!tracedPath || tracedPath.length < 2) return false;
    for (let i = 0; i < tracedPath.length - 1; i++) {
      if ((tracedPath[i] === u && tracedPath[i + 1] === v) ||
          (tracedPath[i] === v && tracedPath[i + 1] === u)) {
        return true;
      }
    }
    return false;
  };

  const canvasHeight = isCompact
    ? 'h-[360px] sm:h-[420px] lg:h-[460px]'
    : 'h-[380px] sm:h-[460px] lg:h-[520px]';

  return (
    <div
      className={`relative w-full ${canvasHeight} bg-[var(--bg-canvas)] rounded-2xl overflow-hidden border border-[var(--border-card)] shadow-2xl select-none flex flex-col transition-colors`}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleMouseUp}
      onTouchCancel={handleMouseUp}
    >
      {/* Precision Dark Grid Pattern */}
      <div
        className="absolute inset-0 opacity-[0.08] pointer-events-none"
        style={{
          backgroundImage:
            'radial-gradient(circle at 1.5px 1.5px, #ffffff 1px, transparent 0)',
          backgroundSize: '28px 28px',
        }}
      />

      {/* Top Header Overlay */}
      <div className="absolute top-3 left-3 right-3 z-20 flex items-center justify-between pointer-events-none">
        {/* Title & Convergence Pill */}
        <div className="flex items-center gap-2 pointer-events-auto">
          {title && (
            <span
              className={`px-3 py-1 rounded-xl text-xs font-bold border shadow-md ${
                protocolType === 'LS'
                  ? 'bg-[#121212] text-cyan-300 border-[#282828]'
                  : 'bg-[#121212] text-amber-300 border-[#282828]'
              }`}
            >
              {title}
            </span>
          )}

          <div
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-[11px] font-semibold font-mono border shadow-md transition-all ${
              isConverged
                ? 'bg-[#121212] text-[#1ed760] border-emerald-500/70 shadow-[0_0_12px_rgba(30,215,96,0.25)] animate-completion-glow'
                : 'bg-[#121212] text-amber-400 border-[#282828]'
            }`}
          >
            {isConverged ? (
              <>
                <CheckCircle2 className="w-3.5 h-3.5 text-[#1ed760] animate-check-snap" />
                <span className="inline-block text-[#1ed760] font-semibold">
                  Converged (t={tick})
                </span>
              </>
            ) : (
              <>
                <Activity className="w-3.5 h-3.5 text-amber-400" />
                <span>In-Flight ({inFlightPackets.length})</span>
                <span className="text-zinc-600">•</span>
                <span key={`inflight-t-${tick}`} className="text-zinc-300 font-bold inline-block animate-tick-flash">
                  t={tick}
                </span>
              </>
            )}
          </div>
        </div>

        {/* Right Toolbar: Send PDU & Packet Visibility */}
        <div className="flex items-center gap-2 pointer-events-auto">
          {tracedPath && tracedPath.length >= 2 && (
            <button
              onClick={() => setLocalTrigger((prev) => prev + 1)}
              className="flex items-center gap-1.5 px-2.5 py-1 bg-[#121212] hover:bg-emerald-950/60 border border-emerald-800/60 rounded-lg text-[11px] text-[#1ed760] font-semibold transition-colors shadow-md cursor-pointer"
              title="Send a Cisco Packet Tracer ICMP PDU envelope along the route"
            >
              <Mail className="w-3.5 h-3.5 text-[#1ed760]" />
              <span>Send PDU</span>
            </button>
          )}

          <button
            onClick={() => setShowPackets(!showPackets)}
            className="flex items-center gap-1.5 px-2.5 py-1 bg-[#121212] hover:bg-[#1a1a1a] border border-[#282828] rounded-lg text-[11px] text-zinc-300 transition-colors shadow-md cursor-pointer"
            title="Toggle visibility of in-flight control packet pulses"
          >
            {showPackets ? <Eye className="w-3 h-3 text-cyan-400" /> : <EyeOff className="w-3 h-3 text-zinc-500" />}
            <span className="hidden sm:inline">{showPackets ? 'Hide Packets' : 'Show Packets'}</span>
          </button>
        </div>
      </div>

      {/* Mode Banner for Add Link */}
      {isAddLinkMode && (
        <div className="absolute top-12 left-1/2 -translate-x-1/2 z-20 px-4 py-1.5 bg-amber-500/20 border border-amber-500/40 rounded-full text-amber-300 text-xs font-semibold backdrop-blur-md flex items-center gap-2 shadow-lg">
          <Zap className="w-3.5 h-3.5 text-amber-400" />
          <span>Click second router to connect link</span>
          <button
            onClick={onCancelAddLink}
            className="ml-2 px-2 py-0.5 bg-amber-500/30 hover:bg-amber-500/50 rounded text-[10px] text-amber-200 cursor-pointer"
          >
            Cancel
          </button>
        </div>
      )}

      {/* SVG Canvas - Responsive Vector Scaling */}
      <svg
        ref={svgRef}
        viewBox={isCompact ? '0 0 660 460' : '0 0 720 480'}
        preserveAspectRatio="xMidYMid meet"
        className="w-full h-full cursor-default touch-none"
      >
        {/* 1. Links Layer */}
        {topology?.links?.map((link) => {
          const posU = nodePositions[link.u];
          const posV = nodePositions[link.v];
          if (!posU || !posV) return null;

          const isDown = link.status === 'down';
          const isSPT = selectedNode && (sptEdges.includes(link.id) || sptEdges.includes(`${link.v}--${link.u}`));
          const isTraced = isLinkInTracedPath(link.u, link.v);
          const midX = (posU.x + posV.x) / 2;
          const midY = (posU.y + posV.y) / 2;

          return (
            <g key={link.id} className="transition-all duration-300">
              {/* Shortest Path Tree Highlight Glow */}
              {isSPT && !isDown && (
                <line
                  x1={posU.x}
                  y1={posU.y}
                  x2={posV.x}
                  y2={posV.y}
                  stroke="#10b981"
                  strokeWidth="7"
                  strokeOpacity="0.3"
                  strokeLinecap="round"
                />
              )}

              {/* Traced Route Highlight Glow */}
              {isTraced && !isDown && (
                <line
                  x1={posU.x}
                  y1={posU.y}
                  x2={posV.x}
                  y2={posV.y}
                  stroke="#1ed760"
                  strokeWidth="6"
                  strokeDasharray="8 4"
                  opacity="0.75"
                />
              )}

              {/* Hit target line */}
              <line
                x1={posU.x}
                y1={posU.y}
                x2={posV.x}
                y2={posV.y}
                stroke="transparent"
                strokeWidth="24"
                className="cursor-pointer"
                onClick={() => onToggleLink(link.u, link.v)}
              />

              {/* Physical Link Line */}
              <line
                x1={posU.x}
                y1={posU.y}
                x2={posV.x}
                y2={posV.y}
                stroke={isDown ? '#f43f5e' : isTraced ? '#10b981' : isSPT ? '#38bdf8' : '#27272a'}
                strokeWidth={isTraced ? '3.5' : isSPT ? '3' : '2'}
                strokeDasharray={isDown ? '6 5' : 'none'}
                strokeLinecap="round"
                className="pointer-events-none transition-colors"
              />

              {/* Link Cost Pill Badge */}
              <foreignObject
                x={midX - 26}
                y={midY - 13}
                width="52"
                height="26"
                className="overflow-visible pointer-events-auto"
              >
                {editingLink === link.id ? (
                  <form
                    onSubmit={(e) => handleCostSubmit(e, link.u, link.v)}
                    className="flex items-center gap-1 bg-zinc-900 border border-cyan-400 rounded-full px-2 py-0.5 shadow-xl"
                  >
                    <input
                      type="number"
                      min="1"
                      max="99"
                      value={newCost}
                      onChange={(e) => setNewCost(e.target.value)}
                      className="w-7 bg-transparent text-center text-xs text-cyan-300 font-mono font-bold outline-none"
                      autoFocus
                    />
                    <button type="submit" className="text-[10px] text-cyan-400 font-bold hover:text-white cursor-pointer">
                      ✓
                    </button>
                  </form>
                ) : (
                  <div
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditingLink(link.id);
                      setNewCost(String(link.cost));
                    }}
                    title="Click pill to edit weight • Click wire to cut/restore link"
                    className={`flex items-center justify-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-mono font-bold cursor-pointer shadow-md transition-transform hover:scale-110 border ${
                      isDown
                        ? 'bg-rose-950 text-rose-300 border-rose-600/80'
                        : isTraced
                        ? 'bg-emerald-950 text-emerald-300 border-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]'
                        : isSPT
                        ? 'bg-sky-950 text-sky-300 border-sky-500/80'
                        : 'bg-zinc-900 text-zinc-300 border-zinc-700 hover:border-zinc-500 hover:text-white'
                    }`}
                  >
                    {isDown ? (
                      <span className="text-[9px] font-extrabold text-rose-400">CUT</span>
                    ) : (
                      <span>{link.cost}</span>
                    )}
                  </div>
                )}
              </foreignObject>
            </g>
          );
        })}

        {/* 2. In-Flight Background Protocol Packets (Clean Pulse Dots on Links) */}
        {showPackets &&
          inFlightPackets.map((pkt) => {
            const posSrc = nodePositions[pkt.src];
            const posDst = nodePositions[pkt.dst];
            if (!posSrc || !posDst) return null;

            const isLS = pkt.protocol === 'LS';
            const dx = posDst.x - posSrc.x;
            const dy = posDst.y - posSrc.y;
            const len = Math.sqrt(dx * dx + dy * dy) || 1;
            const nx = -dy / len;
            const ny = dx / len;

            // Offset 16px to one side
            const offset = pkt.src < pkt.dst ? 16 : -16;
            const px = posSrc.x + dx * 0.35 + nx * offset;
            const py = posSrc.y + dy * 0.35 + ny * offset;

            return (
              <g key={pkt.packet_id} className="pointer-events-none">
                <circle
                  cx={px}
                  cy={py}
                  r={isCompact ? 4.5 : 5.5}
                  fill={isLS ? '#38bdf8' : '#f59e0b'}
                  stroke="#ffffff"
                  strokeWidth="1.5"
                  className={
                    isLS
                      ? 'filter drop-shadow-[0_0_6px_rgba(56,189,248,0.8)]'
                      : 'filter drop-shadow-[0_0_6px_rgba(245,158,11,0.8)]'
                  }
                />
              </g>
            );
          })}

        {/* 2b. Cisco Packet Tracer Style PDU Simulation Layer (One-Shot Round-Trip, No Loop!) */}
        {/* Wire Path Highlight Track */}
        {tracedPath && tracedPath.length >= 2 && (() => {
          const coords = tracedPath.map((id) => nodePositions[id]).filter(Boolean);
          if (coords.length < 2) return null;
          const lineD = 'M ' + coords.map((p) => `${p.x} ${p.y}`).join(' L ');
          return (
            <path
              d={lineD}
              fill="none"
              stroke="#10b981"
              strokeWidth="4"
              strokeDasharray="8 6"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="pointer-events-none opacity-60"
            />
          );
        })()}

        {/* Active Traveling Cisco PDU Envelope */}
        {pduState && (pduState.phase === 'forward' || pduState.phase === 'reply') && pduState.pos && (
          <g className="pointer-events-none">
            {/* The Classic Cisco Packet Tracer PDU Envelope ✉️ */}
            <g transform={`translate(${pduState.pos.x}, ${pduState.pos.y}) rotate(${pduState.angle})`}>
              {/* Outer Glow Wave */}
              <rect
                x="-17"
                y="-12"
                width="34"
                height="24"
                rx="4"
                fill={pduState.isReply ? 'rgba(30,215,96,0.3)' : 'rgba(2,132,199,0.3)'}
                opacity="0.6"
              />

              {/* Main Envelope Body */}
              <rect
                x="-17"
                y="-12"
                width="34"
                height="24"
                rx="3"
                fill={pduState.isReply ? '#ecfdf5' : '#f0f9ff'}
                stroke={pduState.isReply ? '#059669' : '#0284c7'}
                strokeWidth="1.8"
                className="filter drop-shadow-[0_4px_10px_rgba(0,0,0,0.6)]"
              />

              {/* Folded Flap Triangles (Classic Cisco PDU envelope lines) */}
              <path
                d="M -17 -12 L 0 3 L 17 -12"
                fill={pduState.isReply ? '#d1fae5' : '#e0f2fe'}
                stroke={pduState.isReply ? '#059669' : '#0284c7'}
                strokeWidth="1.4"
              />
              <line
                x1="-17"
                y1="12"
                x2="-5"
                y2="1"
                stroke={pduState.isReply ? '#059669' : '#0284c7'}
                strokeWidth="1"
                strokeOpacity="0.4"
              />
              <line
                x1="17"
                y1="12"
                x2="5"
                y2="1"
                stroke={pduState.isReply ? '#059669' : '#0284c7'}
                strokeWidth="1"
                strokeOpacity="0.4"
              />

              {/* Center Wax Seal / Protocol Stamp */}
              <circle
                cx="0"
                cy="3"
                r="3.5"
                fill={pduState.isReply ? '#10b981' : '#0284c7'}
                stroke="#ffffff"
                strokeWidth="1"
              />
            </g>

            {/* Upright Label Pill above the Envelope */}
            <g transform={`translate(${pduState.pos.x}, ${pduState.pos.y - 24})`}>
              <rect
                x="-32"
                y="-9"
                width="64"
                height="18"
                rx="4"
                fill="#090d16"
                stroke={pduState.isReply ? '#10b981' : '#0284c7'}
                strokeWidth="1.2"
                className="filter drop-shadow-[0_2px_6px_rgba(0,0,0,0.8)]"
              />
              <text
                textAnchor="middle"
                dy="4"
                fontSize="8"
                fontWeight="800"
                fill={pduState.isReply ? '#6ee7b7' : '#7dd3fc'}
                fontFamily="ui-monospace, monospace"
              >
                {pduState.isReply ? 'ICMP REPLY' : 'ICMP ECHO'}
              </text>
            </g>
          </g>
        )}

        {/* Cisco Packet Tracer: Successful Arrival Badge at Source Router */}
        {pduState && pduState.phase === 'completed' && pduState.pos && (
          <g transform={`translate(${pduState.pos.x}, ${pduState.pos.y - 36})`} className="pointer-events-none">
            <rect
              x="-46"
              y="-10"
              width="92"
              height="20"
              rx="5"
              fill="#064e3b"
              stroke="#10b981"
              strokeWidth="1.5"
              className="filter drop-shadow-[0_0_10px_rgba(16,185,129,0.7)]"
            />
            <text
              textAnchor="middle"
              dy="4.5"
              fontSize="9"
              fontWeight="bold"
              fill="#a7f3d0"
              fontFamily="ui-monospace, monospace"
            >
              ✔ Successful!
            </text>
          </g>
        )}

        {/* Cisco Packet Tracer: Dropped Packet Badge at Link Outage */}
        {pduState && pduState.phase === 'dropped' && pduState.pos && (
          <g transform={`translate(${pduState.pos.x}, ${pduState.pos.y - 36})`} className="pointer-events-none">
            <rect
              x="-36"
              y="-10"
              width="72"
              height="20"
              rx="5"
              fill="#4c0519"
              stroke="#f43f5e"
              strokeWidth="1.5"
              className="filter drop-shadow-[0_0_10px_rgba(244,63,94,0.7)]"
            />
            <text
              textAnchor="middle"
              dy="4.5"
              fontSize="9"
              fontWeight="bold"
              fill="#fecdd3"
              fontFamily="ui-monospace, monospace"
            >
              ✖ Dropped!
            </text>
          </g>
        )}

        {/* 3. Router Nodes Layer */}
        {topology?.nodes?.map((node) => {
          const pos = nodePositions[node.id];
          if (!pos) return null;

          const isSelected = selectedNode === node.id;
          const isDown = node.status === 'down';
          const isSourceForLink = addLinkSource === node.id;
          const isTracedNode = tracedPath && tracedPath.includes(node.id);
          const isTracedSource = tracedPath && tracedPath[0] === node.id;
          const isTracedDest = tracedPath && tracedPath[tracedPath.length - 1] === node.id;
          const ipAddr = getNodeIp(node.id);
          const radius = isCompact ? 23 : 26;

          return (
            <g
              key={node.id}
              transform={`translate(${pos.x}, ${pos.y})`}
              className="cursor-pointer select-none"
              onMouseDown={(e) => handleMouseDown(node.id, e)}
              onTouchStart={(e) => handleTouchStart(node.id, e)}
            >
              {/* Tick Synchronization Ripple: 1-shot expanding wave on each clock tick */}
              {tick > 0 && !isDown && (
                <circle
                  key={`tick-ripple-${tick}-${node.id}`}
                  r={radius + 3}
                  fill="none"
                  stroke="#1ed760"
                  strokeWidth="2"
                  className="animate-tick-ripple pointer-events-none"
                />
              )}

              {/* Outer Selection Ring */}
              {isSelected && (
                <circle
                  r={radius + 8}
                  fill="none"
                  stroke="#1ed760"
                  strokeWidth="2"
                  strokeDasharray="4 3"
                  opacity="0.85"
                />
              )}

              {/* Traced Source/Dest Ring */}
              {isTracedNode && (
                <circle
                  r={radius + 6}
                  fill="none"
                  stroke="#1ed760"
                  strokeWidth="2"
                  strokeDasharray="4 2"
                  opacity="0.9"
                />
              )}

              {/* Hop Sequence Badge (SRC, HOP 1, DST) */}
              {isTracedNode && (() => {
                const hopIdx = tracedPath.indexOf(node.id);
                const isSrc = hopIdx === 0;
                const isDst = hopIdx === tracedPath.length - 1;
                const badgeText = isSrc ? 'SRC' : isDst ? 'DST' : `HOP ${hopIdx}`;
                const badgeBg = isSrc ? '#059669' : isDst ? '#10b981' : '#0284c7';

                return (
                  <g transform={`translate(0, ${-(radius + 12)})`} className="pointer-events-none">
                    <rect
                      x="-18"
                      y="-7"
                      width="36"
                      height="14"
                      rx="4"
                      fill={badgeBg}
                      className="filter drop-shadow-[0_0_6px_rgba(16,185,129,0.5)]"
                    />
                    <text
                      textAnchor="middle"
                      dy="3.5"
                      fill="#ffffff"
                      fontSize="8.5"
                      fontWeight="900"
                      fontFamily="ui-monospace, monospace"
                    >
                      {badgeText}
                    </text>
                  </g>
                );
              })()}

              {/* Node Outer Chassis */}
              <circle
                r={radius}
                fill={
                  isDown
                    ? '#18181b'
                    : isSourceForLink
                    ? '#451a03'
                    : isTracedSource
                    ? '#064e3b'
                    : isTracedDest
                    ? '#064e3b'
                    : isSelected
                    ? '#0f2338'
                    : '#13141d'
                }
                stroke={
                  isDown
                    ? '#f43f5e'
                    : isSourceForLink
                    ? '#f59e0b'
                    : isTracedSource || isTracedDest
                    ? '#10b981'
                    : isSelected
                    ? '#38bdf8'
                    : '#3f3f46'
                }
                strokeWidth={isSelected || isTracedNode ? '2.5' : '1.75'}
                className="transition-colors hover:stroke-cyan-400"
              />

              {/* Inner Decorative Router Chassis Ring */}
              <circle
                r={radius - 4.5}
                fill="none"
                stroke={isDown ? '#27272a' : isTracedNode ? '#047857' : isSelected ? '#0284c7' : '#27272a'}
                strokeWidth="1"
                strokeDasharray="3 2"
                className="pointer-events-none opacity-60"
              />

              {/* Router Monogram Letter */}
              <text
                textAnchor="middle"
                dy="5"
                fill={isDown ? '#71717a' : '#fafafa'}
                fontSize={isCompact ? '13' : '15'}
                fontWeight="800"
                fontFamily="ui-monospace, monospace"
              >
                {node.id}
              </text>

              {/* Sub-label card with Router Name & IP */}
              <g transform={`translate(0, ${isCompact ? 33 : 37})`} className="pointer-events-none">
                <rect
                  x="-40"
                  y="-7"
                  width="80"
                  height="24"
                  rx="6"
                  fill="#12131a"
                  stroke={isTracedNode ? '#10b981' : isSelected ? '#38bdf8' : '#27272a'}
                  strokeWidth="1"
                  className="filter drop-shadow-md"
                />
                <text
                  textAnchor="middle"
                  dy="4"
                  fill="#f4f4f5"
                  fontSize="9.5"
                  fontWeight="700"
                >
                  Router {node.id}
                </text>
                <text
                  textAnchor="middle"
                  dy="13.5"
                  fill="#94a3b8"
                  fontSize="8"
                  fontFamily="monospace"
                >
                  {ipAddr}
                </text>
              </g>
            </g>
          );
        })}
      </svg>

      {/* Cisco Packet Tracer Simulation Status Pill */}
      {pduState && (
        <div className="absolute bottom-11 left-1/2 -translate-x-1/2 z-20 px-3.5 py-1 rounded-full border backdrop-blur-md shadow-xl flex items-center gap-2 text-[11px] font-mono bg-zinc-950/95 border-zinc-800">
          {pduState.phase === 'forward' && (
            <div className="flex items-center gap-1.5 text-sky-300">
              <Mail className="w-3.5 h-3.5 text-sky-400" />
              <span>Outbound: {pduState.statusText}</span>
            </div>
          )}
          {pduState.phase === 'reply' && (
            <div className="flex items-center gap-1.5 text-emerald-300">
              <Mail className="w-3.5 h-3.5 text-[#1ed760]" />
              <span>Return: {pduState.statusText}</span>
            </div>
          )}
          {pduState.phase === 'completed' && (
            <div className="flex items-center gap-1.5 text-emerald-400 font-semibold">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              <span>Cisco PDU: {pduState.statusText}</span>
            </div>
          )}
          {pduState.phase === 'dropped' && (
            <div className="flex items-center gap-1.5 text-rose-400 font-semibold">
              <XCircle className="w-3.5 h-3.5 text-rose-400" />
              <span>Cisco PDU: {pduState.statusText}</span>
            </div>
          )}
        </div>
      )}

      {/* Footer Instructions Bar */}
      <div className="absolute bottom-2.5 left-3 right-3 flex items-center justify-between text-[10px] text-zinc-400 bg-zinc-900/90 backdrop-blur-md px-3 py-1.5 rounded-xl border border-zinc-800 shadow-md">
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-cyan-400" />
            <span className="text-zinc-200">Click node:</span> inspect
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-0.5 bg-rose-500 border border-dashed border-rose-500" />
            <span className="text-zinc-200">Click wire:</span> cut/restore
          </span>
          <span className="flex items-center gap-1">
            <span className="px-1 bg-zinc-800 text-zinc-200 rounded font-mono text-[9px]">1</span>
            <span className="text-zinc-200">Click pill:</span> cost
          </span>
        </div>
        <div className="text-[10px] text-zinc-500 font-mono hidden sm:inline">
          Drag to arrange
        </div>
      </div>
    </div>
  );
}

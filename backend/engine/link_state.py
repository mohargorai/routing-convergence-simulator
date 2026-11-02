"""
Deterministic Link State (OSPF-style) Routing Engine.
Implements:
- Monotonic LSA sequence numbers, flooding, and neighbor forwarding
- Local Link State Database (LSDB) synchronization per node
- Dijkstra's Shortest Path First (SPF) algorithm
- Shortest Path Tree (SPT) computation and next-hop forwarding tables
- Accurate control packet overhead tracking and convergence detection
"""
from __future__ import annotations
import heapq
from typing import Dict, List, Optional, Set, Any
from pydantic import BaseModel
from .topology import Topology, Link


class LSA(BaseModel):
    adv_router: str
    seq_num: int
    age: int = 0
    links: Dict[str, int]  # neighbor_id -> cost

    def to_dict(self) -> Dict[str, Any]:
        return {
            "adv_router": self.adv_router,
            "seq_num": self.seq_num,
            "age": self.age,
            "links": self.links,
        }


class ControlPacket(BaseModel):
    packet_id: str
    protocol: str = "LS"  # "LS" or "DV"
    src: str
    dst: str
    packet_type: str = "LSA"
    payload: Dict[str, Any]
    progress: float = 0.0  # 0.0 to 1.0 for UI visual interpolation

    def to_dict(self) -> Dict[str, Any]:
        return {
            "packet_id": self.packet_id,
            "protocol": self.protocol,
            "src": self.src,
            "dst": self.dst,
            "packet_type": self.packet_type,
            "payload": self.payload,
            "progress": self.progress,
        }


class LSNodeState:
    """Internal Link State protocol state for an individual router."""

    def __init__(self, node_id: str):
        self.node_id = node_id
        self.seq_num: int = 0
        self.lsdb: Dict[str, LSA] = {}  # adv_router -> latest LSA
        self.last_announced_links: Dict[str, int] = {}
        self.routing_table: Dict[str, Dict[str, Any]] = {}  # dest -> {cost, next_hop, path}
        self.spt_edges: List[str] = []  # Link IDs in shortest path tree
        self.lsa_generated_count: int = 0

    def to_dict(self) -> Dict[str, Any]:
        return {
            "node_id": self.node_id,
            "seq_num": self.seq_num,
            "lsdb": {k: v.to_dict() for k, v in self.lsdb.items()},
            "routing_table": self.routing_table,
            "spt_edges": self.spt_edges,
            "lsa_generated_count": self.lsa_generated_count,
        }


class LinkStateEngine:
    """Coordinates Link State flooding and SPF calculation across the network."""

    def __init__(self, topology: Topology):
        self.topology = topology
        self.nodes: Dict[str, LSNodeState] = {}
        self.in_flight_packets: List[ControlPacket] = []
        self.packet_counter: int = 0
        self.total_control_packets: int = 0
        self.current_tick: int = 0
        self.is_converged: bool = False
        self.convergence_tick: Optional[int] = None
        self.recent_logs: List[Dict[str, Any]] = []
        self.reset()

    def reset(self) -> None:
        """Reset state machines for all active nodes."""
        self.nodes.clear()
        self.in_flight_packets.clear()
        self.packet_counter = 0
        self.total_control_packets = 0
        self.current_tick = 0
        self.is_converged = False
        self.convergence_tick = None
        self.recent_logs.clear()

        for nid, node in self.topology.nodes.items():
            if node.status == "up":
                self.nodes[nid] = LSNodeState(nid)

        self._log("Link State (OSPF/Dijkstra) engine initialized.", level="info")
        # Trigger initial LSA generation
        self._generate_initial_lsas()

    def _log(self, message: str, level: str = "info", details: Optional[Dict[str, Any]] = None) -> None:
        entry = {
            "tick": self.current_tick,
            "protocol": "Link State",
            "message": message,
            "level": level,
            "details": details or {},
        }
        self.recent_logs.insert(0, entry)
        if len(self.recent_logs) > 100:
            self.recent_logs.pop()

    def _next_packet_id(self) -> str:
        self.packet_counter += 1
        return f"lsa-pkt-{self.packet_counter}"

    def _generate_initial_lsas(self) -> None:
        """Generate and flood sequence 1 LSA for all nodes."""
        for nid, state in self.nodes.items():
            neighbors = self.topology.get_neighbors(nid, only_up=True)
            link_map = {n: cost_link[0] for n, cost_link in neighbors.items()}
            state.seq_num = 1
            state.lsa_generated_count += 1
            lsa = LSA(adv_router=nid, seq_num=state.seq_num, links=link_map)
            state.lsdb[nid] = lsa
            state.last_announced_links = link_map

            # Initialize local routing table with directly connected physical interfaces
            state.routing_table = {
                nid: {"cost": 0, "next_hop": nid, "path": [nid]}
            }
            for nbr_id, (cost, _) in neighbors.items():
                if nbr_id in self.nodes:
                    state.routing_table[nbr_id] = {
                        "cost": cost,
                        "next_hop": nbr_id,
                        "path": [nid, nbr_id],
                    }

            # Flood to all neighbors
            for neighbor_id in neighbors:
                if neighbor_id in self.nodes:
                    pkt = ControlPacket(
                        packet_id=self._next_packet_id(),
                        protocol="LS",
                        src=nid,
                        dst=neighbor_id,
                        packet_type="LSA",
                        payload={"lsa": lsa.to_dict(), "sent_from": nid},
                        progress=0.0,
                    )
                    self.in_flight_packets.append(pkt)
                    self.total_control_packets += 1

        self._log(
            f"Tick {self.current_tick}: Initial LSAs flooded by {len(self.nodes)} nodes. Packets in-flight: {len(self.in_flight_packets)}"
        )
        self._recompute_all_spf()

    def notify_topology_changed(self) -> None:
        """Called when topology links/nodes mutate (break, restore, cost change)."""
        self.is_converged = False
        self.convergence_tick = None

        # Synchronize node states with topology
        active_ids = set(self.topology.get_all_active_nodes())
        # Remove dead nodes
        for dead_id in list(self.nodes.keys()):
            if dead_id not in active_ids:
                del self.nodes[dead_id]

        # Add new nodes
        for new_id in active_ids:
            if new_id not in self.nodes:
                self.nodes[new_id] = LSNodeState(new_id)

        # Check each node for link changes
        any_triggered = False
        for nid, state in self.nodes.items():
            neighbors = self.topology.get_neighbors(nid, only_up=True)
            curr_map = {n: cost_link[0] for n, cost_link in neighbors.items()}
            if curr_map != state.last_announced_links:
                state.seq_num += 1
                state.lsa_generated_count += 1
                lsa = LSA(adv_router=nid, seq_num=state.seq_num, links=curr_map)
                state.lsdb[nid] = lsa
                state.last_announced_links = curr_map
                any_triggered = True

                for neighbor_id in neighbors:
                    if neighbor_id in self.nodes:
                        pkt = ControlPacket(
                            packet_id=self._next_packet_id(),
                            protocol="LS",
                            src=nid,
                            dst=neighbor_id,
                            packet_type="LSA",
                            payload={"lsa": lsa.to_dict(), "sent_from": nid},
                            progress=0.0,
                        )
                        self.in_flight_packets.append(pkt)
                        self.total_control_packets += 1

                self._log(
                    f"Node {nid} detected local link change. Generated LSA #{state.seq_num} and flooded to {len(neighbors)} neighbors.",
                    level="warning",
                )

        if not any_triggered:
            self._recompute_all_spf()

    def step(self) -> Dict[str, Any]:
        """
        Executes one discrete simulation tick:
        1. Delivers all currently in-flight LSAs to their destinations.
        2. Destination updates LSDB and floods newer LSAs to its other neighbors.
        3. Recalculates Dijkstra SPF for nodes whose LSDB changed.
        4. Evaluates convergence.
        """
        if self.is_converged:
            return self.get_telemetry()

        self.current_tick += 1
        packets_to_deliver = list(self.in_flight_packets)
        self.in_flight_packets.clear()

        next_in_flight: List[ControlPacket] = []
        nodes_with_lsdb_change: Set[str] = set()

        for pkt in packets_to_deliver:
            dest_id = pkt.dst
            if dest_id not in self.nodes:
                continue  # Destination node is down

            dest_state = self.nodes[dest_id]
            raw_lsa = pkt.payload.get("lsa", {})
            adv_router = raw_lsa.get("adv_router")
            seq_num = raw_lsa.get("seq_num", 0)
            links = raw_lsa.get("links", {})
            sent_from = pkt.payload.get("sent_from", pkt.src)

            # Check if this LSA is newer than what dest_id currently holds
            current_lsa = dest_state.lsdb.get(adv_router)
            if current_lsa is None or seq_num > current_lsa.seq_num:
                # Accept newer LSA
                new_lsa = LSA(adv_router=adv_router, seq_num=seq_num, links=links)
                dest_state.lsdb[adv_router] = new_lsa
                nodes_with_lsdb_change.add(dest_id)

                # Flood to all other active neighbors except the incoming interface
                active_neighbors = self.topology.get_neighbors(dest_id, only_up=True)
                for neighbor_id in active_neighbors:
                    if neighbor_id != sent_from and neighbor_id in self.nodes:
                        new_pkt = ControlPacket(
                            packet_id=self._next_packet_id(),
                            protocol="LS",
                            src=dest_id,
                            dst=neighbor_id,
                            packet_type="LSA",
                            payload={"lsa": new_lsa.to_dict(), "sent_from": dest_id},
                            progress=0.0,
                        )
                        next_in_flight.append(new_pkt)
                        self.total_control_packets += 1

                self._log(
                    f"Node {dest_id} accepted LSA for {adv_router} (seq #{seq_num}) from {sent_from}; flooded to {len(active_neighbors) - 1} neighbors."
                )

        self.in_flight_packets = next_in_flight

        # Recalculate Dijkstra for modified nodes
        tables_mutated = False
        for nid in nodes_with_lsdb_change:
            mutated = self._run_dijkstra_for_node(nid)
            if mutated:
                tables_mutated = True

        # Check for convergence: no packets in flight and no further changes
        if len(self.in_flight_packets) == 0 and not tables_mutated:
            self.is_converged = True
            if self.convergence_tick is None:
                self.convergence_tick = self.current_tick
            self._log(
                f"Link State network CONVERGED at tick {self.current_tick} (Total LSA control packets: {self.total_control_packets}).",
                level="success",
            )

        return self.get_telemetry()

    def _run_dijkstra_for_node(self, node_id: str) -> bool:
        """Runs Dijkstra algorithm on node's local LSDB. Returns True if routing table changed."""
        state = self.nodes.get(node_id)
        if not state:
            return False

        # Build graph from local LSDB
        graph: Dict[str, Dict[str, int]] = {}
        for r_id, lsa in state.lsdb.items():
            graph[r_id] = lsa.links

        # Dijkstra algorithm
        dist: Dict[str, float] = {node_id: 0}
        prev: Dict[str, Optional[str]] = {node_id: None}
        pq = [(0, node_id)]
        visited: Set[str] = set()

        while pq:
            curr_dist, u = heapq.heappop(pq)
            if u in visited:
                continue
            visited.add(u)

            for neighbor, weight in graph.get(u, {}).items():
                if neighbor in visited:
                    continue
                # Both routers must advertise the link for it to be bidirectional in OSPF
                back_links = graph.get(neighbor, {})
                if u not in back_links:
                    continue  # Asymmetric / dead unidirectional link

                new_dist = curr_dist + weight
                if neighbor not in dist or new_dist < dist[neighbor]:
                    dist[neighbor] = new_dist
                    prev[neighbor] = u
                    heapq.heappush(pq, (new_dist, neighbor))

        # Reconstruct paths and next hops
        new_routing_table: Dict[str, Dict[str, Any]] = {}
        spt_edges: List[str] = []

        for target in dist:
            if target == node_id:
                new_routing_table[node_id] = {"cost": 0, "next_hop": node_id, "path": [node_id]}
                continue

            # Trace back from target to node_id
            curr = target
            path = [curr]
            while prev.get(curr) is not None:
                p = prev[curr]
                spt_edges.append(Link.make_id(p, curr))
                curr = p
                path.append(curr)

            path.reverse()
            # The next hop is the second node in path
            next_hop = path[1] if len(path) > 1 else target
            new_routing_table[target] = {
                "cost": dist[target],
                "next_hop": next_hop,
                "path": path,
            }

        # Handle disconnected graph nodes: maintain direct links or explicitly mark unreachable nodes
        direct_neighbors = self.topology.get_neighbors(node_id, only_up=True)
        for other_node_id in self.nodes:
            if other_node_id not in new_routing_table:
                if other_node_id in direct_neighbors:
                    cost, _ = direct_neighbors[other_node_id]
                    new_routing_table[other_node_id] = {
                        "cost": cost,
                        "next_hop": other_node_id,
                        "path": [node_id, other_node_id],
                    }
                else:
                    new_routing_table[other_node_id] = {
                        "cost": 16,
                        "next_hop": None,
                        "path": [],
                    }

        table_changed = (new_routing_table != state.routing_table)
        state.routing_table = new_routing_table
        state.spt_edges = list(set(spt_edges))
        return table_changed

    def _recompute_all_spf(self) -> None:
        for nid in self.nodes:
            self._run_dijkstra_for_node(nid)

    def get_telemetry(self) -> Dict[str, Any]:
        """Compile complete Link State telemetry for dashboard streaming."""
        all_tables = {nid: st.routing_table for nid, st in self.nodes.items()}
        all_lsdbs = {nid: {k: v.to_dict() for k, v in st.lsdb.items()} for nid, st in self.nodes.items()}
        all_spts = {nid: st.spt_edges for nid, st in self.nodes.items()}

        # Average hop count (only valid paths of length >= 2)
        hop_counts: List[int] = []
        for src, table in all_tables.items():
            for dst, entry in table.items():
                if src != dst and entry.get("path") and len(entry["path"]) >= 2:
                    hop_counts.append(len(entry["path"]) - 1)

        avg_hop = round(sum(hop_counts) / max(1, len(hop_counts)), 2) if hop_counts else 0.0

        return {
            "protocol": "Link State (OSPF / Dijkstra)",
            "tick": self.current_tick,
            "is_converged": self.is_converged,
            "convergence_tick": self.convergence_tick,
            "total_control_packets": self.total_control_packets,
            "in_flight_count": len(self.in_flight_packets),
            "in_flight_packets": [p.to_dict() for p in self.in_flight_packets],
            "routing_tables": all_tables,
            "lsdbs": all_lsdbs,
            "spt_edges": all_spts,
            "avg_hop_count": avg_hop,
            "active_node_count": len(self.nodes),
            "recent_logs": self.recent_logs[:15],
        }

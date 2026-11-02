"""
Deterministic Distance Vector (RIP-style Bellman-Ford) Routing Engine.
Implements:
- Distributed Bellman-Ford shortest path iteration
- Configurable Split Horizon and Poison Reverse modes
- Configurable Infinity Metric (default: 16)
- Accurate Count-to-Infinity detection and routing loop diagnostics
- Triggered update mechanisms upon link state/cost mutations
- Full telemetry streaming with in-flight vector packet visualization
"""
from __future__ import annotations
import copy
from typing import Dict, List, Optional, Set, Tuple, Any
from pydantic import BaseModel, Field
from .topology import Topology, Link
from .link_state import ControlPacket


class DVRoute(BaseModel):
    cost: int
    next_hop: Optional[str]
    hops: int = 1
    loop_detected: bool = False

    def to_dict(self) -> Dict[str, Any]:
        return {
            "cost": self.cost,
            "next_hop": self.next_hop,
            "hops": self.hops,
            "loop_detected": self.loop_detected,
        }


class DVNodeState:
    """Internal Distance Vector protocol state for an individual router."""

    def __init__(self, node_id: str, infinity_metric: int = 16):
        self.node_id = node_id
        self.infinity_metric = infinity_metric
        # routing_table: dest -> DVRoute
        self.routing_table: Dict[str, DVRoute] = {
            node_id: DVRoute(cost=0, next_hop=node_id, hops=0, loop_detected=False)
        }
        # neighbor_vectors: neighbor_id -> {dest: cost}
        self.neighbor_vectors: Dict[str, Dict[str, int]] = {}
        self.vector_sent_count: int = 0
        self.has_unadvertised_changes: bool = True

    def get_advertisement(
        self,
        target_neighbor: str,
        split_horizon: bool = True,
        poison_reverse: bool = True,
    ) -> Dict[str, int]:
        """
        Calculates the distance vector to advertise to target_neighbor,
        applying Split Horizon and/or Poison Reverse rules.
        """
        advert: Dict[str, int] = {}
        for dest, route in self.routing_table.items():
            cost = route.cost

            # If the route to 'dest' routes through 'target_neighbor':
            if route.next_hop == target_neighbor and dest != target_neighbor:
                if poison_reverse:
                    # Poison Reverse: actively advertise infinity
                    advert[dest] = self.infinity_metric
                elif split_horizon:
                    # Split Horizon: completely omit route
                    continue
                else:
                    # Neither: advertise normally (triggers count-to-infinity loop!)
                    advert[dest] = min(cost, self.infinity_metric)
            else:
                advert[dest] = min(cost, self.infinity_metric)

        return advert

    def to_dict(self) -> Dict[str, Any]:
        return {
            "node_id": self.node_id,
            "routing_table": {k: v.to_dict() for k, v in self.routing_table.items()},
            "neighbor_vectors": self.neighbor_vectors,
            "vector_sent_count": self.vector_sent_count,
        }


class DistanceVectorEngine:
    """Coordinates Distance Vector / Bellman-Ford exchanges and loop tracking."""

    def __init__(
        self,
        topology: Topology,
        split_horizon: bool = True,
        poison_reverse: bool = True,
        infinity_metric: int = 16,
    ):
        self.topology = topology
        self.split_horizon = split_horizon
        self.poison_reverse = poison_reverse
        self.infinity_metric = infinity_metric
        self.nodes: Dict[str, DVNodeState] = {}
        self.in_flight_packets: List[ControlPacket] = []
        self.packet_counter: int = 0
        self.total_control_packets: int = 0
        self.current_tick: int = 0
        self.is_converged: bool = False
        self.convergence_tick: Optional[int] = None
        self.recent_logs: List[Dict[str, Any]] = []
        self.count_to_infinity_events: List[Dict[str, Any]] = []
        self.reset()

    def set_options(
        self,
        split_horizon: Optional[bool] = None,
        poison_reverse: Optional[bool] = None,
        infinity_metric: Optional[int] = None,
    ) -> None:
        if split_horizon is not None:
            self.split_horizon = split_horizon
        if poison_reverse is not None:
            self.poison_reverse = poison_reverse
        if infinity_metric is not None:
            self.infinity_metric = infinity_metric
            for n in self.nodes.values():
                n.infinity_metric = self.infinity_metric

        self._log(
            f"Distance Vector options updated: SplitHorizon={self.split_horizon}, PoisonReverse={self.poison_reverse}, Infinity={self.infinity_metric}"
        )
        self.notify_topology_changed()

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
        self.count_to_infinity_events.clear()

        for nid, node in self.topology.nodes.items():
            if node.status == "up":
                self.nodes[nid] = DVNodeState(nid, infinity_metric=self.infinity_metric)

        self._log("Distance Vector (Bellman-Ford/RIP) engine initialized.", level="info")
        # Initialize direct neighbor distances and broadcast first vectors
        self._init_direct_neighbors()
        self._broadcast_vectors()

    def _log(self, message: str, level: str = "info", details: Optional[Dict[str, Any]] = None) -> None:
        entry = {
            "tick": self.current_tick,
            "protocol": "Distance Vector",
            "message": message,
            "level": level,
            "details": details or {},
        }
        self.recent_logs.insert(0, entry)
        if len(self.recent_logs) > 100:
            self.recent_logs.pop()

    def _next_packet_id(self) -> str:
        self.packet_counter += 1
        return f"dv-pkt-{self.packet_counter}"

    def _init_direct_neighbors(self) -> None:
        """Initialize routing tables with direct link costs."""
        for nid, state in self.nodes.items():
            state.routing_table = {
                nid: DVRoute(cost=0, next_hop=nid, hops=0, loop_detected=False)
            }
            neighbors = self.topology.get_neighbors(nid, only_up=True)
            for neighbor_id, (cost, _) in neighbors.items():
                if neighbor_id in self.nodes:
                    state.routing_table[neighbor_id] = DVRoute(
                        cost=cost, next_hop=neighbor_id, hops=1, loop_detected=False
                    )

    def _broadcast_vectors(self) -> None:
        """Send distance vector advertisements to all active neighbors."""
        for nid, state in self.nodes.items():
            neighbors = self.topology.get_neighbors(nid, only_up=True)
            for neighbor_id in neighbors:
                if neighbor_id in self.nodes:
                    vector = state.get_advertisement(
                        target_neighbor=neighbor_id,
                        split_horizon=self.split_horizon,
                        poison_reverse=self.poison_reverse,
                    )
                    pkt = ControlPacket(
                        packet_id=self._next_packet_id(),
                        protocol="DV",
                        src=nid,
                        dst=neighbor_id,
                        packet_type="VECTOR",
                        payload={"vector": vector, "sender": nid},
                        progress=0.0,
                    )
                    self.in_flight_packets.append(pkt)
                    self.total_control_packets += 1
                    state.vector_sent_count += 1
            state.has_unadvertised_changes = False

    def notify_topology_changed(self) -> None:
        """Called upon link failure, recovery, or cost mutation."""
        self.is_converged = False
        self.convergence_tick = None

        active_ids = set(self.topology.get_all_active_nodes())
        for dead_id in list(self.nodes.keys()):
            if dead_id not in active_ids:
                del self.nodes[dead_id]

        for new_id in active_ids:
            if new_id not in self.nodes:
                self.nodes[new_id] = DVNodeState(new_id, infinity_metric=self.infinity_metric)

        # Invalidate dead links in neighbor vectors and routing tables
        for nid, state in self.nodes.items():
            current_neighbors = self.topology.get_neighbors(nid, only_up=True)
            # Remove cached vectors from neighbors no longer active
            for cached_neigh in list(state.neighbor_vectors.keys()):
                if cached_neigh not in current_neighbors:
                    del state.neighbor_vectors[cached_neigh]

            # Invalidate routes whose next hop is no longer a neighbor or down
            for dest, route in list(state.routing_table.items()):
                if dest == nid:
                    continue
                if route.next_hop not in current_neighbors:
                    # Next-hop link died! Triggered poison
                    route.cost = self.infinity_metric
                    route.next_hop = None
                    state.has_unadvertised_changes = True

            # Trigger Bellman-Ford recomputation with available neighbors
            self._recompute_bellman_ford_node(nid)

        # Broadcast triggered updates immediately
        self._broadcast_vectors()
        self._log(
            "Topology mutation triggered Distance Vector re-evaluation and triggered update broadcasts.",
            level="warning",
        )

    def step(self) -> Dict[str, Any]:
        """
        Executes one discrete simulation tick:
        1. Delivers all in-flight Distance Vector packets.
        2. Routers update their neighbor vectors and recompute Bellman-Ford shortest paths.
        3. Detects Count-to-Infinity and routing loops.
        4. If any routes changed, generates new vector advertisements for next tick.
        5. Checks for convergence.
        """
        if self.is_converged:
            return self.get_telemetry()

        self.current_tick += 1
        packets_to_deliver = list(self.in_flight_packets)
        self.in_flight_packets.clear()

        nodes_updated: Set[str] = set()

        for pkt in packets_to_deliver:
            dest_id = pkt.dst
            if dest_id not in self.nodes:
                continue

            dest_state = self.nodes[dest_id]
            vector = pkt.payload.get("vector", {})
            sender = pkt.payload.get("sender", pkt.src)

            # Store neighbor's vector
            prev_vector = dest_state.neighbor_vectors.get(sender, {})
            if prev_vector != vector:
                dest_state.neighbor_vectors[sender] = copy.deepcopy(vector)
                nodes_updated.add(dest_id)

        # Run Bellman-Ford on all nodes that received new vectors
        any_route_changed = False
        for nid in nodes_updated:
            changed = self._recompute_bellman_ford_node(nid)
            if changed:
                any_route_changed = True
                self.nodes[nid].has_unadvertised_changes = True

        # Check for routing loops and Count-to-Infinity
        self._detect_routing_loops()

        # If any routes changed, send new updates to neighbors for next tick
        if any_route_changed:
            for nid, state in self.nodes.items():
                if state.has_unadvertised_changes:
                    neighbors = self.topology.get_neighbors(nid, only_up=True)
                    for neighbor_id in neighbors:
                        if neighbor_id in self.nodes:
                            vector = state.get_advertisement(
                                target_neighbor=neighbor_id,
                                split_horizon=self.split_horizon,
                                poison_reverse=self.poison_reverse,
                            )
                            new_pkt = ControlPacket(
                                packet_id=self._next_packet_id(),
                                protocol="DV",
                                src=nid,
                                dst=neighbor_id,
                                packet_type="VECTOR",
                                payload={"vector": vector, "sender": nid},
                                progress=0.0,
                            )
                            self.in_flight_packets.append(new_pkt)
                            self.total_control_packets += 1
                    state.has_unadvertised_changes = False

        # Convergence test: no in-flight packets and no route changes
        if len(self.in_flight_packets) == 0 and not any_route_changed:
            self.is_converged = True
            if self.convergence_tick is None:
                self.convergence_tick = self.current_tick
            self._log(
                f"Distance Vector network CONVERGED at tick {self.current_tick} (Total vector packets: {self.total_control_packets}).",
                level="success",
            )

        return self.get_telemetry()

    def _recompute_bellman_ford_node(self, node_id: str) -> bool:
        """
        Executes Bellman-Ford step for node_id:
        D_x(y) = min_v { c(x, v) + D_v(y) }
        Returns True if the routing table changed.
        """
        state = self.nodes.get(node_id)
        if not state:
            return False

        old_table = {k: (v.cost, v.next_hop) for k, v in state.routing_table.items()}
        neighbors = self.topology.get_neighbors(node_id, only_up=True)

        # Collect all known destinations across all nodes, self, and neighbors
        all_dests: Set[str] = set(self.nodes.keys())
        for n_id, (link_cost, _) in neighbors.items():
            n_vector = state.neighbor_vectors.get(n_id, {})
            all_dests.update(n_vector.keys())

        new_table: Dict[str, DVRoute] = {
            node_id: DVRoute(cost=0, next_hop=node_id, hops=0, loop_detected=False)
        }

        for dest in all_dests:
            if dest == node_id:
                continue

            min_cost = self.infinity_metric
            best_next_hop: Optional[str] = None
            best_hops = 1

            # Option 1: Direct link (if destination is an active neighbor)
            if dest in neighbors:
                direct_cost = neighbors[dest][0]
                if direct_cost < min_cost:
                    min_cost = direct_cost
                    best_next_hop = dest
                    best_hops = 1

            # Option 2: Through neighbor v
            for v, (cost_xv, _) in neighbors.items():
                if v in state.neighbor_vectors:
                    v_vector = state.neighbor_vectors[v]
                    if dest in v_vector:
                        cand_cost = cost_xv + v_vector[dest]
                        if cand_cost < min_cost:
                            min_cost = cand_cost
                            best_next_hop = v
                            # Estimated hops
                            best_hops = 2

            if min_cost >= self.infinity_metric:
                new_table[dest] = DVRoute(
                    cost=self.infinity_metric,
                    next_hop=None,
                    hops=999,
                    loop_detected=False,
                )
            else:
                new_table[dest] = DVRoute(
                    cost=min_cost,
                    next_hop=best_next_hop,
                    hops=best_hops,
                    loop_detected=False,
                )

        state.routing_table = new_table
        new_summary = {k: (v.cost, v.next_hop) for k, v in new_table.items()}
        return new_summary != old_table

    def _detect_routing_loops(self) -> None:
        """
        Inspect all router forwarding pointers to detect active routing loops and Count-to-Infinity.
        Flags loop_detected on routes.
        """
        all_nodes = list(self.nodes.keys())
        for src in all_nodes:
            table = self.nodes[src].routing_table
            for dest, route in table.items():
                if dest == src or route.next_hop is None or route.cost >= self.infinity_metric:
                    route.loop_detected = False
                    continue

                visited: List[str] = [src]
                curr = route.next_hop
                loop_found = False

                while curr is not None and curr in self.nodes and curr != dest:
                    if curr in visited:
                        loop_found = True
                        break
                    visited.append(curr)
                    next_route = self.nodes[curr].routing_table.get(dest)
                    if not next_route:
                        break
                    curr = next_route.next_hop

                route.loop_detected = loop_found
                if loop_found and route.cost > 2 and route.cost < self.infinity_metric:
                    loop_info = {
                        "tick": self.current_tick,
                        "source": src,
                        "dest": dest,
                        "loop_cycle": visited + [curr],
                        "current_cost": route.cost,
                    }
                    if not any(
                        e["tick"] == self.current_tick and e["source"] == src and e["dest"] == dest
                        for e in self.count_to_infinity_events
                    ):
                        self.count_to_infinity_events.append(loop_info)
                        self._log(
                            f"COUNT-TO-INFINITY LOOP DETECTED for destination {dest}! Cycle: {' -> '.join(visited + [str(curr)])} (Cost: {route.cost})",
                            level="danger",
                            details=loop_info,
                        )

    def get_telemetry(self) -> Dict[str, Any]:
        """Compile complete Distance Vector telemetry for dashboard streaming."""
        all_tables = {
            nid: {dest: r.to_dict() for dest, r in st.routing_table.items()}
            for nid, st in self.nodes.items()
        }
        all_vectors = {nid: st.neighbor_vectors for nid, st in self.nodes.items()}

        # Count active loops
        total_loops = sum(
            1 for st in self.nodes.values() for r in st.routing_table.values() if r.loop_detected
        )

        return {
            "protocol": "Distance Vector (Bellman-Ford / RIP)",
            "tick": self.current_tick,
            "is_converged": self.is_converged,
            "convergence_tick": self.convergence_tick,
            "split_horizon": self.split_horizon,
            "poison_reverse": self.poison_reverse,
            "infinity_metric": self.infinity_metric,
            "total_control_packets": self.total_control_packets,
            "in_flight_count": len(self.in_flight_packets),
            "in_flight_packets": [p.to_dict() for p in self.in_flight_packets],
            "routing_tables": all_tables,
            "neighbor_vectors": all_vectors,
            "total_loops_detected": total_loops,
            "count_to_infinity_events": self.count_to_infinity_events[-10:],
            "active_node_count": len(self.nodes),
            "recent_logs": self.recent_logs[:15],
        }

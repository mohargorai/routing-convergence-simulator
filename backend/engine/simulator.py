"""
Simulation Coordinator orchestrating Link State, Distance Vector, and Dual-Protocol
comparison modes, topology mutations, Mininet synchronization, and live telemetry.
"""
from __future__ import annotations
import logging
import time
from typing import Dict, List, Optional, Any
from .topology import Topology
from .link_state import LinkStateEngine
from .distance_vector import DistanceVectorEngine
from .mininet_bridge import bridge

logger = logging.getLogger("simulator")


class SimulationCoordinator:
    """Central simulation coordinator orchestrating protocol engines and real-time telemetry."""

    def __init__(self, initial_preset: str = "triangle"):
        self.preset_name = initial_preset
        self.topology = self._get_preset_topology(initial_preset)
        self.protocol = "LS"  # "LS", "DV", or "DUAL"
        self.ls_engine = LinkStateEngine(self.topology)
        self.dv_engine = DistanceVectorEngine(self.topology)
        self.mode = "step"  # "step" or "continuous"
        self.speed_ms = 500  # ms per tick in continuous mode
        self.is_running = False
        self.mininet_sync_enabled = True

        # Initialize Mininet / virtual namespace bridge
        bridge.start_topology(self.topology)
        self._sync_mininet()

    def _get_preset_topology(self, preset: str) -> Topology:
        presets = {
            "triangle": Topology.preset_triangle,
            "diamond": Topology.preset_diamond,
            "count_to_infinity": Topology.preset_count_to_infinity,
            "ring_5": Topology.preset_ring_5,
            "mesh_6": Topology.preset_mesh_6,
        }
        factory = presets.get(preset, Topology.preset_triangle)
        return factory()

    def load_preset(self, preset_name: str) -> None:
        self.preset_name = preset_name
        self.topology = self._get_preset_topology(preset_name)
        self.ls_engine = LinkStateEngine(self.topology)
        self.dv_engine = DistanceVectorEngine(self.topology)
        bridge.start_topology(self.topology)
        self._sync_mininet()

    def set_protocol(self, protocol: str) -> None:
        if protocol.upper() in ["LS", "DV", "DUAL"]:
            self.protocol = protocol.upper()

    def set_dv_options(
        self,
        split_horizon: Optional[bool] = None,
        poison_reverse: Optional[bool] = None,
        infinity_metric: Optional[int] = None,
    ) -> None:
        self.dv_engine.set_options(
            split_horizon=split_horizon,
            poison_reverse=poison_reverse,
            infinity_metric=infinity_metric,
        )

    def reset(self) -> None:
        self.ls_engine.reset()
        self.dv_engine.reset()
        self._sync_mininet()

    def step(self) -> Dict[str, Any]:
        """Advance the simulation by one discrete tick according to active protocol."""
        if self.protocol == "LS":
            self.ls_engine.step()
        elif self.protocol == "DV":
            self.dv_engine.step()
        elif self.protocol == "DUAL":
            # Step both engines side-by-side
            self.ls_engine.step()
            self.dv_engine.step()

        self._sync_mininet()
        return self.get_full_state()

    def _sync_mininet(self) -> None:
        """Synchronize routes to Mininet / virtual namespaces."""
        if not self.mininet_sync_enabled:
            return
        active_engine = self.ls_engine if self.protocol in ["LS", "DUAL"] else self.dv_engine
        for nid, rstate in active_engine.nodes.items():
            if hasattr(rstate, "routing_table"):
                table = rstate.routing_table
                bridge.sync_routes(nid, table)

    # ==================== Dynamic Topology Mutations ====================

    def toggle_link(self, u: str, v: str) -> Optional[str]:
        new_status = self.topology.toggle_link(u, v)
        if new_status:
            self.ls_engine.notify_topology_changed()
            self.dv_engine.notify_topology_changed()
            bridge.set_link_status(u, v, new_status)
            self._sync_mininet()
        return new_status

    def set_link_cost(self, u: str, v: str, cost: int) -> bool:
        ok = self.topology.set_link_cost(u, v, cost)
        if ok:
            self.ls_engine.notify_topology_changed()
            self.dv_engine.notify_topology_changed()
            self._sync_mininet()
        return ok

    def add_node(self, node_id: str, label: Optional[str] = None, x: float = 0.0, y: float = 0.0) -> Any:
        node = self.topology.add_node(node_id, label, x, y)
        self.ls_engine.notify_topology_changed()
        self.dv_engine.notify_topology_changed()
        bridge.start_topology(self.topology)
        return node

    def remove_node(self, node_id: str) -> bool:
        ok = self.topology.remove_node(node_id)
        if ok:
            self.ls_engine.notify_topology_changed()
            self.dv_engine.notify_topology_changed()
            bridge.start_topology(self.topology)
        return ok

    def add_link(self, u: str, v: str, cost: int = 1) -> Any:
        link = self.topology.add_link(u, v, cost)
        if link:
            self.ls_engine.notify_topology_changed()
            self.dv_engine.notify_topology_changed()
            bridge.start_topology(self.topology)
            self._sync_mininet()
        return link

    def remove_link(self, u: str, v: str) -> bool:
        ok = self.topology.remove_link(u, v)
        if ok:
            self.ls_engine.notify_topology_changed()
            self.dv_engine.notify_topology_changed()
            bridge.start_topology(self.topology)
            self._sync_mininet()
        return ok

    # ==================== Dual-Protocol Benchmark ====================

    def run_dual_comparison(self, max_ticks: int = 60) -> Dict[str, Any]:
        """
        Runs an isolated benchmark on the exact same topology clone:
        executing Link State and Distance Vector side-by-side until both converge,
        measuring convergence time, control packet overhead, and loop count.
        """
        topo_copy_ls = self.topology.clone()
        topo_copy_dv = self.topology.clone()

        ls_sim = LinkStateEngine(topo_copy_ls)
        dv_sim = DistanceVectorEngine(
            topo_copy_dv,
            split_horizon=self.dv_engine.split_horizon,
            poison_reverse=self.dv_engine.poison_reverse,
            infinity_metric=self.dv_engine.infinity_metric,
        )

        # Benchmark Link State
        ls_start = time.perf_counter()
        ls_converged = False
        ls_ticks = 0
        while not ls_converged and ls_ticks < max_ticks:
            ls_sim.step()
            ls_ticks = ls_sim.current_tick
            ls_converged = ls_sim.is_converged
        ls_duration_ms = round((time.perf_counter() - ls_start) * 1000, 3)

        # Benchmark Distance Vector
        dv_start = time.perf_counter()
        dv_converged = False
        dv_ticks = 0
        while not dv_converged and dv_ticks < max_ticks:
            dv_sim.step()
            dv_ticks = dv_sim.current_tick
            dv_converged = dv_sim.is_converged
        dv_duration_ms = round((time.perf_counter() - dv_start) * 1000, 3)

        return {
            "topology_name": self.topology.name,
            "node_count": len(self.topology.nodes),
            "link_count": len(self.topology.links),
            "link_state": {
                "converged": ls_converged,
                "ticks": ls_ticks,
                "duration_ms": ls_duration_ms,
                "control_packets": ls_sim.total_control_packets,
                "avg_hop_count": ls_sim.get_telemetry()["avg_hop_count"],
            },
            "distance_vector": {
                "converged": dv_converged,
                "ticks": dv_ticks,
                "duration_ms": dv_duration_ms,
                "control_packets": dv_sim.total_control_packets,
                "split_horizon": self.dv_engine.split_horizon,
                "poison_reverse": self.dv_engine.poison_reverse,
                "loops_detected": len(dv_sim.count_to_infinity_events),
            },
            "verdict": (
                "Link State converged faster with deterministic SPF"
                if ls_ticks < dv_ticks
                else (
                    "Distance Vector matched or exceeded Link State convergence"
                    if dv_ticks <= ls_ticks
                    else "Count-to-Infinity prolonged Distance Vector convergence"
                )
            ),
        }

    # ==================== Full State Compilation ====================

    def get_full_state(self) -> Dict[str, Any]:
        """Produces serialized state payload for WebSocket clients and REST queries."""
        ls_telemetry = self.ls_engine.get_telemetry()
        dv_telemetry = self.dv_engine.get_telemetry()

        # Active telemetry depending on mode
        active_telemetry = ls_telemetry if self.protocol == "LS" else dv_telemetry
        if self.protocol == "DUAL":
            active_telemetry = {
                "protocol": "Dual-Protocol Comparison",
                "tick": max(ls_telemetry["tick"], dv_telemetry["tick"]),
                "is_converged": ls_telemetry["is_converged"] and dv_telemetry["is_converged"],
                "in_flight_packets": ls_telemetry["in_flight_packets"] + dv_telemetry["in_flight_packets"],
                "recent_logs": (ls_telemetry["recent_logs"][:7] + dv_telemetry["recent_logs"][:7]),
            }

        return {
            "protocol": self.protocol,
            "mode": self.mode,
            "is_running": self.is_running,
            "speed_ms": self.speed_ms,
            "preset_name": self.preset_name,
            "topology": self.topology.to_dict(),
            "mininet_status": bridge.get_status(),
            "active_telemetry": active_telemetry,
            "ls_telemetry": ls_telemetry,
            "dv_telemetry": dv_telemetry,
        }


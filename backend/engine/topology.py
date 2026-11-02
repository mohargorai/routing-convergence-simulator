"""
Network Topology Data Model and Graph Mutation Management.
Provides thread-safe topology manipulation, preset network templates,
and neighbor queries for routing protocols.
"""
from __future__ import annotations
import copy
import threading
from typing import Dict, List, Optional, Tuple, Any
from pydantic import BaseModel, Field


class Node(BaseModel):
    id: str
    label: str
    x: float = 0.0
    y: float = 0.0
    status: str = "up"  # "up" or "down"

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "label": self.label,
            "x": self.x,
            "y": self.y,
            "status": self.status,
        }


class Link(BaseModel):
    id: str
    u: str
    v: str
    cost: int = Field(default=1, ge=1, le=999)
    status: str = "up"  # "up" or "down"
    latency_ms: int = Field(default=10, ge=1, le=5000)

    @classmethod
    def make_id(cls, u: str, v: str) -> str:
        nodes = sorted([u, v])
        return f"{nodes[0]}--{nodes[1]}"

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "u": self.u,
            "v": self.v,
            "cost": self.cost,
            "status": self.status,
            "latency_ms": self.latency_ms,
        }


class Topology:
    """Thread-safe network topology representation with dynamic mutations."""

    def __init__(self, name: str = "Default Topology"):
        self.name = name
        self.nodes: Dict[str, Node] = {}
        self.links: Dict[str, Link] = {}
        self._lock = threading.RLock()
        self.version: int = 1

    def clone(self) -> Topology:
        with self._lock:
            new_topo = Topology(self.name)
            new_topo.nodes = copy.deepcopy(self.nodes)
            new_topo.links = copy.deepcopy(self.links)
            new_topo.version = self.version
            return new_topo

    def add_node(self, node_id: str, label: Optional[str] = None, x: float = 0.0, y: float = 0.0) -> Node:
        with self._lock:
            lbl = label or f"R_{node_id}"
            node = Node(id=node_id, label=lbl, x=x, y=y, status="up")
            self.nodes[node_id] = node
            self.version += 1
            return node

    def remove_node(self, node_id: str) -> bool:
        with self._lock:
            if node_id not in self.nodes:
                return False
            del self.nodes[node_id]
            # Remove all attached links
            to_delete = [
                lid for lid, lk in self.links.items()
                if lk.u == node_id or lk.v == node_id
            ]
            for lid in to_delete:
                del self.links[lid]
            self.version += 1
            return True

    def set_node_status(self, node_id: str, status: str) -> bool:
        with self._lock:
            if node_id not in self.nodes:
                return False
            self.nodes[node_id].status = status
            self.version += 1
            return True

    def add_link(self, u: str, v: str, cost: int = 1, latency_ms: int = 10) -> Optional[Link]:
        with self._lock:
            if u not in self.nodes or v not in self.nodes or u == v:
                return None
            lid = Link.make_id(u, v)
            link = Link(id=lid, u=u, v=v, cost=cost, status="up", latency_ms=latency_ms)
            self.links[lid] = link
            self.version += 1
            return link

    def remove_link(self, u: str, v: str) -> bool:
        with self._lock:
            lid = Link.make_id(u, v)
            if lid in self.links:
                del self.links[lid]
                self.version += 1
                return True
            return False

    def set_link_cost(self, u: str, v: str, cost: int) -> bool:
        with self._lock:
            lid = Link.make_id(u, v)
            if lid in self.links:
                self.links[lid].cost = max(1, cost)
                self.version += 1
                return True
            return False

    def set_link_status(self, u: str, v: str, status: str) -> bool:
        with self._lock:
            lid = Link.make_id(u, v)
            if lid in self.links:
                self.links[lid].status = status
                self.version += 1
                return True
            return False

    def toggle_link(self, u: str, v: str) -> Optional[str]:
        with self._lock:
            lid = Link.make_id(u, v)
            if lid in self.links:
                curr = self.links[lid].status
                new_status = "down" if curr == "up" else "up"
                self.links[lid].status = new_status
                self.version += 1
                return new_status
            return None

    def get_neighbors(self, node_id: str, only_up: bool = True) -> Dict[str, Tuple[int, Link]]:
        """Returns map: neighbor_id -> (cost, Link)."""
        with self._lock:
            neighbors: Dict[str, Tuple[int, Link]] = {}
            if node_id not in self.nodes:
                return neighbors
            if only_up and self.nodes[node_id].status != "up":
                return neighbors

            for link in self.links.values():
                if only_up and link.status != "up":
                    continue
                neighbor = None
                if link.u == node_id:
                    neighbor = link.v
                elif link.v == node_id:
                    neighbor = link.u

                if neighbor:
                    if only_up and self.nodes.get(neighbor, Node(id=neighbor, label=neighbor)).status != "up":
                        continue
                    neighbors[neighbor] = (link.cost, link)
            return neighbors

    def get_all_active_nodes(self) -> List[str]:
        with self._lock:
            return [nid for nid, node in self.nodes.items() if node.status == "up"]

    def to_dict(self) -> Dict[str, Any]:
        with self._lock:
            return {
                "name": self.name,
                "version": self.version,
                "nodes": [n.to_dict() for n in self.nodes.values()],
                "links": [l.to_dict() for l in self.links.values()],
            }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> Topology:
        topo = cls(name=data.get("name", "Custom Topology"))
        for n in data.get("nodes", []):
            topo.add_node(n["id"], n.get("label"), n.get("x", 0.0), n.get("y", 0.0))
            if n.get("status") == "down":
                topo.set_node_status(n["id"], "down")
        for l in data.get("links", []):
            lk = topo.add_link(l["u"], l["v"], l.get("cost", 1), l.get("latency_ms", 10))
            if lk and l.get("status") == "down":
                topo.set_link_status(l["u"], l["v"], "down")
        return topo

    # ==================== Presets ====================

    @classmethod
    def preset_triangle(cls) -> Topology:
        t = cls("3-Node Triangle (Classic Loop)")
        t.add_node("A", "Router A", x=180, y=130)
        t.add_node("B", "Router B", x=540, y=130)
        t.add_node("C", "Router C", x=360, y=370)
        t.add_link("A", "B", cost=1)
        t.add_link("B", "C", cost=2)
        t.add_link("A", "C", cost=5)
        return t

    @classmethod
    def preset_diamond(cls) -> Topology:
        t = cls("4-Node Diamond (Multi-Path)")
        t.add_node("A", "Router A", x=140, y=240)
        t.add_node("B", "Router B", x=360, y=100)
        t.add_node("C", "Router C", x=360, y=380)
        t.add_node("D", "Router D", x=580, y=240)
        t.add_link("A", "B", cost=1)
        t.add_link("A", "C", cost=3)
        t.add_link("B", "D", cost=4)
        t.add_link("C", "D", cost=1)
        t.add_link("B", "C", cost=1)
        return t

    @classmethod
    def preset_count_to_infinity(cls) -> Topology:
        """Classic 3-node linear topology designed to trigger count-to-infinity when link B-C fails."""
        t = cls("Count-to-Infinity Trap (Line)")
        t.add_node("A", "Router A", x=150, y=240)
        t.add_node("B", "Router B", x=360, y=240)
        t.add_node("C", "Router C", x=580, y=240)
        t.add_link("A", "B", cost=1)
        t.add_link("B", "C", cost=1)
        return t

    @classmethod
    def preset_ring_5(cls) -> Topology:
        t = cls("5-Node Ring Network")
        t.add_node("A", "Router A", x=360, y=80)
        t.add_node("B", "Router B", x=550, y=180)
        t.add_node("C", "Router C", x=480, y=380)
        t.add_node("D", "Router D", x=240, y=380)
        t.add_node("E", "Router E", x=170, y=180)
        t.add_link("A", "B", cost=2)
        t.add_link("B", "C", cost=3)
        t.add_link("C", "D", cost=1)
        t.add_link("D", "E", cost=4)
        t.add_link("E", "A", cost=2)
        return t

    @classmethod
    def preset_mesh_6(cls) -> Topology:
        t = cls("6-Node Dense Mesh")
        t.add_node("A", "Router A", x=220, y=100)
        t.add_node("B", "Router B", x=500, y=100)
        t.add_node("C", "Router C", x=620, y=240)
        t.add_node("D", "Router D", x=500, y=380)
        t.add_node("E", "Router E", x=220, y=380)
        t.add_node("F", "Router F", x=100, y=240)
        t.add_link("A", "B", cost=2)
        t.add_link("B", "C", cost=3)
        t.add_link("C", "D", cost=1)
        t.add_link("D", "E", cost=2)
        t.add_link("E", "F", cost=4)
        t.add_link("F", "A", cost=3)
        t.add_link("B", "E", cost=2)
        t.add_link("A", "D", cost=4)
        t.add_link("F", "C", cost=5)
        return t


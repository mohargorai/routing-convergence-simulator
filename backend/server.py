"""
FastAPI Server and Real-Time WebSocket Telemetry Broadcaster.
Serves REST API, handles WebSocket bi-directional streaming, background continuous execution,
and automated Mininet cleanup on server shutdown.
"""
from __future__ import annotations
import asyncio
import json
import logging
import os
from contextlib import asynccontextmanager
from typing import Dict, List, Set, Any, Optional

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from backend.engine.simulator import SimulationCoordinator
from backend.engine.mininet_bridge import bridge

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger("server")

# Global coordinator instance
coordinator = SimulationCoordinator(initial_preset="triangle")
background_task: Optional[asyncio.Task] = None


class ConnectionManager:
    """Manages active client WebSocket connections and broadcasts state updates."""

    def __init__(self):
        self.active_connections: Set[WebSocket] = set()
        self._lock = asyncio.Lock()

    async def connect(self, websocket: WebSocket) -> None:
        await websocket.accept()
        async with self._lock:
            self.active_connections.add(websocket)
        logger.info(f"WebSocket client connected. Total clients: {len(self.active_connections)}")
        # Send initial full state immediately
        await websocket.send_text(json.dumps(coordinator.get_full_state()))

    async def disconnect(self, websocket: WebSocket) -> None:
        async with self._lock:
            self.active_connections.discard(websocket)
        logger.info(f"WebSocket client disconnected. Total clients: {len(self.active_connections)}")

    async def broadcast(self, message: Dict[str, Any]) -> None:
        async with self._lock:
            clients = list(self.active_connections)
        if not clients:
            return

        payload = json.dumps(message)
        dead_connections: List[WebSocket] = []
        for connection in clients:
            try:
                await connection.send_text(payload)
            except Exception:
                dead_connections.append(connection)

        if dead_connections:
            async with self._lock:
                for dead in dead_connections:
                    self.active_connections.discard(dead)


manager = ConnectionManager()


async def continuous_runner():
    """Background task advancing simulation when is_running is True."""
    logger.info("Continuous simulation loop started.")
    try:
        while True:
            if coordinator.is_running:
                # Check if already converged in single-engine mode
                if coordinator.protocol == "LS" and coordinator.ls_engine.is_converged:
                    coordinator.is_running = False
                elif coordinator.protocol == "DV" and coordinator.dv_engine.is_converged:
                    coordinator.is_running = False
                elif coordinator.protocol == "DUAL" and coordinator.ls_engine.is_converged and coordinator.dv_engine.is_converged:
                    coordinator.is_running = False
                else:
                    coordinator.step()
                await manager.broadcast(coordinator.get_full_state())

            sleep_duration = max(0.1, coordinator.speed_ms / 1000.0)
            await asyncio.sleep(sleep_duration)
    except asyncio.CancelledError:
        logger.info("Continuous simulation loop stopped.")


@asynccontextmanager
async def lifespan(app: FastAPI):
    global background_task
    background_task = asyncio.create_task(continuous_runner())
    logger.info("FastAPI routing convergence simulator backend initialized.")
    yield
    # Shutdown
    if background_task:
        background_task.cancel()
        try:
            await background_task
        except asyncio.CancelledError:
            pass
    bridge.cleanup()
    logger.info("Backend cleanup complete. Mininet and resources scrubbed.")


app = FastAPI(
    title="Routing Convergence Simulator API",
    description="Interactive Link State & Distance Vector Convergence Simulator with Mininet",
    version="1.0.0",
    lifespan=lifespan,
)

# Enable CORS for localhost Vite frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ==================== Request Models ====================

class ProtocolRequest(BaseModel):
    protocol: str  # "LS", "DV", "DUAL"


class DVOptionsRequest(BaseModel):
    split_horizon: Optional[bool] = None
    poison_reverse: Optional[bool] = None
    infinity_metric: Optional[int] = Field(None, ge=3, le=99)


class PresetRequest(BaseModel):
    preset: str


class LinkToggleRequest(BaseModel):
    u: str
    v: str


class LinkCostRequest(BaseModel):
    u: str
    v: str
    cost: int = Field(..., ge=1, le=999)


class NodeAddRequest(BaseModel):
    id: str
    label: Optional[str] = None
    x: float = 200.0
    y: float = 200.0


class LinkAddRequest(BaseModel):
    u: str
    v: str
    cost: int = Field(default=1, ge=1, le=999)


class SpeedRequest(BaseModel):
    speed_ms: int = Field(..., ge=100, le=5000)


class PingRequest(BaseModel):
    src: str
    dst: str


# ==================== REST Endpoints ====================

@app.get("/api/status")
async def get_status():
    return {
        "status": "online",
        "protocol": coordinator.protocol,
        "is_running": coordinator.is_running,
        "mode": coordinator.mode,
        "speed_ms": coordinator.speed_ms,
        "preset_name": coordinator.preset_name,
        "mininet": bridge.get_status(),
    }


@app.get("/api/state")
async def get_state():
    return coordinator.get_full_state()


@app.post("/api/simulation/step")
async def simulation_step():
    state = coordinator.step()
    await manager.broadcast(state)
    return state


@app.post("/api/simulation/run")
async def simulation_run():
    coordinator.is_running = True
    coordinator.mode = "continuous"
    state = coordinator.get_full_state()
    await manager.broadcast(state)
    return {"status": "running"}


@app.post("/api/simulation/pause")
async def simulation_pause():
    coordinator.is_running = False
    coordinator.mode = "step"
    state = coordinator.get_full_state()
    await manager.broadcast(state)
    return {"status": "paused"}


@app.post("/api/simulation/reset")
async def simulation_reset():
    coordinator.is_running = False
    coordinator.reset()
    state = coordinator.get_full_state()
    await manager.broadcast(state)
    return state


@app.post("/api/simulation/protocol")
async def set_protocol(req: ProtocolRequest):
    coordinator.set_protocol(req.protocol)
    state = coordinator.get_full_state()
    await manager.broadcast(state)
    return state


@app.post("/api/simulation/dv-options")
async def set_dv_options(req: DVOptionsRequest):
    coordinator.set_dv_options(
        split_horizon=req.split_horizon,
        poison_reverse=req.poison_reverse,
        infinity_metric=req.infinity_metric,
    )
    state = coordinator.get_full_state()
    await manager.broadcast(state)
    return state


@app.post("/api/simulation/speed")
async def set_speed(req: SpeedRequest):
    coordinator.speed_ms = req.speed_ms
    state = coordinator.get_full_state()
    await manager.broadcast(state)
    return {"speed_ms": coordinator.speed_ms}


@app.post("/api/topology/preset")
async def set_preset(req: PresetRequest):
    await asyncio.to_thread(coordinator.load_preset, req.preset)
    state = coordinator.get_full_state()
    await manager.broadcast(state)
    return state


@app.post("/api/topology/link/toggle")
async def toggle_link(req: LinkToggleRequest):
    status = coordinator.toggle_link(req.u, req.v)
    if status is None:
        raise HTTPException(status_code=404, detail="Link not found")
    state = coordinator.get_full_state()
    await manager.broadcast(state)
    return {"link_id": f"{req.u}--{req.v}", "status": status}


@app.post("/api/topology/link/cost")
async def set_link_cost(req: LinkCostRequest):
    ok = coordinator.set_link_cost(req.u, req.v, req.cost)
    if not ok:
        raise HTTPException(status_code=404, detail="Link not found")
    state = coordinator.get_full_state()
    await manager.broadcast(state)
    return {"success": True, "cost": req.cost}


@app.post("/api/topology/node")
async def add_node(req: NodeAddRequest):
    node = coordinator.add_node(req.id, req.label, req.x, req.y)
    state = coordinator.get_full_state()
    await manager.broadcast(state)
    return node.to_dict()


@app.delete("/api/topology/node/{node_id}")
async def remove_node(node_id: str):
    ok = coordinator.remove_node(node_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Node not found")
    state = coordinator.get_full_state()
    await manager.broadcast(state)
    return {"deleted": node_id}


@app.post("/api/topology/link")
async def add_link(req: LinkAddRequest):
    link = coordinator.add_link(req.u, req.v, req.cost)
    if not link:
        raise HTTPException(status_code=400, detail="Cannot create link (invalid nodes or self-loop)")
    state = coordinator.get_full_state()
    await manager.broadcast(state)
    return link.to_dict()


@app.delete("/api/topology/link/{u}/{v}")
async def remove_link(u: str, v: str):
    ok = coordinator.remove_link(u, v)
    if not ok:
        raise HTTPException(status_code=404, detail="Link not found")
    state = coordinator.get_full_state()
    await manager.broadcast(state)
    return {"deleted": f"{u}--{v}"}


@app.get("/api/simulation/compare")
async def compare_protocols():
    report = coordinator.run_dual_comparison()
    return report


@app.post("/api/mininet/ping")
async def ping_test(req: PingRequest):
    active_engine = coordinator.ls_engine if coordinator.protocol in ["LS", "DUAL"] else coordinator.dv_engine
    node_state = active_engine.nodes.get(req.src)
    route_info = None
    if node_state and hasattr(node_state, "routing_table"):
        route_info = node_state.routing_table.get(req.dst)
        if hasattr(route_info, "to_dict"):
            route_info = route_info.to_dict()
    res = bridge.ping_test(
        req.src,
        req.dst,
        route_info=route_info,
        is_converged=active_engine.is_converged,
        tick=active_engine.current_tick,
    )
    return res


# ==================== Real-time WebSocket Endpoint ====================

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            text = await websocket.receive_text()
            data = json.loads(text)
            action = data.get("action")

            if action == "step":
                coordinator.step()
            elif action == "run":
                coordinator.is_running = True
                coordinator.mode = "continuous"
            elif action == "pause":
                coordinator.is_running = False
                coordinator.mode = "step"
            elif action == "reset":
                coordinator.is_running = False
                coordinator.reset()
            elif action == "set_protocol":
                proto = data.get("protocol", "LS")
                coordinator.set_protocol(proto)
            elif action == "set_dv_options":
                coordinator.set_dv_options(
                    split_horizon=data.get("split_horizon"),
                    poison_reverse=data.get("poison_reverse"),
                    infinity_metric=data.get("infinity_metric"),
                )
            elif action == "set_speed":
                coordinator.speed_ms = int(data.get("speed_ms", 500))
            elif action == "load_preset":
                preset = data.get("preset", "triangle")
                await asyncio.to_thread(coordinator.load_preset, preset)
            elif action == "toggle_link":
                coordinator.toggle_link(data.get("u"), data.get("v"))
            elif action == "set_link_cost":
                coordinator.set_link_cost(data.get("u"), data.get("v"), int(data.get("cost", 1)))
            elif action == "add_node":
                coordinator.add_node(
                    data.get("id"),
                    data.get("label"),
                    float(data.get("x", 200.0)),
                    float(data.get("y", 200.0)),
                )
            elif action == "remove_node":
                coordinator.remove_node(data.get("id"))
            elif action == "add_link":
                coordinator.add_link(data.get("u"), data.get("v"), int(data.get("cost", 1)))
            elif action == "remove_link":
                coordinator.remove_link(data.get("u"), data.get("v"))

            # Broadcast updated state after handling action
            await manager.broadcast(coordinator.get_full_state())

    except WebSocketDisconnect:
        await manager.disconnect(websocket)
    except Exception as ex:
        logger.warning(f"WebSocket client error: {ex}")
        await manager.disconnect(websocket)


# Mount static production build of frontend if exists
dist_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "frontend", "dist"))
if os.path.exists(dist_dir):
    app.mount("/", StaticFiles(directory=dist_dir, html=True), name="frontend")


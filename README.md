# Interactive Link State & Distance Vector Routing Convergence Simulator

> 🎓 **Academic Project:** Developed as part of the Semester 5 Computer Networks Course.

[![Python](https://img.shields.io/badge/Python_3.10+-3776AB?style=for-the-badge&logo=python&logoColor=white)](https://python.org)
[![FastAPI](https://img.shields.io/badge/FastAPI-009688?style=for-the-badge&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![React 19](https://img.shields.io/badge/React_19-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)](https://react.dev)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white)](https://tailwindcss.com)
[![WebSockets](https://img.shields.io/badge/WebSockets-010101?style=for-the-badge&logo=socketdotio&logoColor=white)](https://developer.mozilla.org/en-US/docs/Web/API/WebSockets_API)
[![Mininet OVS](https://img.shields.io/badge/Mininet_OVS-E95420?style=for-the-badge&logo=linux&logoColor=white)](http://mininet.org)
[![Docker](https://img.shields.io/badge/Docker-2496ED?style=for-the-badge&logo=docker&logoColor=white)](https://www.docker.com)
[![Kubernetes](https://img.shields.io/badge/Kubernetes-326CE5?style=for-the-badge&logo=kubernetes&logoColor=white)](https://kubernetes.io)

A production-ready network systems simulator and real-time visualization platform built to demonstrate and analyze the fundamental convergence mechanics of **Link State (OSPF / Dijkstra)** and **Distance Vector (RIP / Bellman-Ford)** routing protocols.

Equipped with an interactive dark-mode React dashboard, Mininet Linux network namespace integration, WebSocket telemetry streaming, Docker containerization, and Kubernetes manifests.

---

## Architecture Overview

```
                      +---------------------------------------+
                      |       React 19 + Tailwind CSS UI      |
                      |   - Interactive Topology Canvas (SVG) |
                      |   - Live Routing Table Inspector      |
                      |   - In-Flight Control Packet Pulses   |
                      |   - Dual-Protocol Comparison Cards    |
                      +-------------------+-------------------+
                                          |
                      WebSockets (/ws)    |    REST API (/api/...)
                      State Broadcasts    |    Mutations & Ping
                                          v
                      +---------------------------------------+
                      |         FastAPI Server Runtime        |
                      |    (server.py & ConnectionManager)    |
                      +-------------------+-------------------+
                                          |
                       +------------------+------------------+
                       |                                     |
                       v                                     v
         +----------------------------+        +----------------------------+
         |     Link State Engine      |        |   Distance Vector Engine   |
         |  - OSPF LSA Flooding       |        |  - Bellman-Ford Iteration  |
         |  - Sequence Numbers & Age  |        |  - Split Horizon Toggle    |
         |  - Dijkstra Shortest Path  |        |  - Poison Reverse Toggle   |
         |  - Shortest Path Tree (SPT)|        |  - Count-to-Infinity Trap  |
         +-------------+--------------+        +-------------+--------------+
                       |                                     |
                       +------------------+------------------+
                                          |
                                          v
                      +---------------------------------------+
                      |       Mininet & Namespace Bridge      |
                      |  - Linux 'ip route' synchronization   |
                      |  - veth interfaces & ICMP Echo Pings  |
                      |  - Automatic cleanup hook ('mn -c')   |
                      +---------------------------------------+
```

---

## Key Features

1. **Dual-Protocol Side-by-Side Comparison**
   - Run the exact same custom topology simultaneously under both Link State and Distance Vector algorithms.
   - Synchronized side-by-side canvas views with independent metric badges and equalized telemetry cards.
   - Real-time comparison metrics: convergence time (ms & ticks), control packet message overhead, path optimality, and loop detection.

2. **Deterministic State Machines**
   - **Link State (OSPF-style)**: Monotonic LSA sequence numbers, flooding across active neighbors, local Link State Database (LSDB) synchronization, and Dijkstra SPF calculation.
   - **Distance Vector (RIP-style)**: Distributed Bellman-Ford vector exchanges, with configurable **Split Horizon** and **Poison Reverse** toggles, and infinity metric customization (16, 32, 99).

3. **Cisco Packet Tracer Style Hop-by-Hop PDU Simulation**
   - Select any source and destination router to inspect and compare forwarding decisions.
   - Animated PDU envelope traversal along computed routes with live hop highlighting and round-trip verification.
   - Data-plane fallback to native Linux kernel ICMP echo pings inside Mininet network namespaces.

4. **Dynamic Topology Mutations & Count-to-Infinity Detection**
   - Add/remove routers and links dynamically.
   - Click any link to trigger sudden link failures (`DOWN`) or recoveries (`UP`).
   - Edit link weights/costs inline.
   - Visual detection and step-by-step observation of Distance Vector **Count-to-Infinity** cost inflation with interactive 3-step educational lab.

5. **Academic Lab Report Generator**
   - Export formal markdown lab reports formatted for academic grading and submission.
   - Includes executive summary, convergence comparison metrics, link matrix, and complete per-router forwarding tables.

6. **Spotify OLED Dark UI & Responsive Architecture**
   - Industrial OLED dark theme (`#000000`, card `#121212`, accent `#1ed760`) with JetBrains Mono typography.
   - Fully responsive layout audited across mobile (<640px), tablet (640-1024px), and desktop/dual-pane screens.
   - Sleek convergence lock-in HUD notification pill and discrete single-shot tick synchronization ripples.

7. **Mininet Kernel Namespace Integration with Failsafe Cleanup**
   - Automatic detection of Linux Mininet runtime; configures router hosts and IP forwarding (`sysctl -w net.ipv4.ip_forward=1`).
   - Falls back seamlessly to virtual software namespaces on non-root or non-Linux systems.
   - Guaranteed automatic cleanup via `atexit` and signal handlers executing `mn -c` to scrub orphaned Open vSwitch / veth devices.

---

## Project Structure

```
├── backend/
│   ├── engine/
│   │   ├── __init__.py
│   │   ├── topology.py             # Network graph model, dynamic mutations & presets
│   │   ├── mininet_bridge.py       # Mininet OVS manager, fallback namespaces & mn -c cleanup
│   │   ├── link_state.py           # Dijkstra SPF, LSA sequence flooding & LSDB
│   │   ├── distance_vector.py      # Bellman-Ford, Split Horizon, Poison Reverse & loop checks
│   │   └── simulator.py            # Central coordinator & dual-protocol benchmarking
│   ├── server.py                   # FastAPI server, WebSockets & static frontend mount
│   ├── verify_sim.py               # Verification test suite for routing engines
│   ├── test_server_api.py          # REST endpoint integration tests
│   ├── test_websocket.py           # WebSocket bi-directional streaming tests
│   └── requirements.txt            # Backend dependencies
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── TopologyCanvas.jsx         # SVG network visualizer with in-flight packets & tick ripple
│   │   │   ├── ControlPanel.jsx           # Protocol toggles, presets, speed slider & play/step controls
│   │   │   ├── PacketTracerBar.jsx        # Cisco Packet Tracer hop-by-hop PDU envelope simulation
│   │   │   ├── RoutingTableModal.jsx      # Telemetry inspector, LSDB/vectors & Mininet ping
│   │   │   ├── ComparisonPanel.jsx        # Dual-protocol benchmark comparison scorecard
│   │   │   ├── CountToInfinityModal.jsx   # Interactive 3-step Count-to-Infinity & Poison Reverse lab
│   │   │   ├── LabReportModal.jsx         # Formal markdown academic lab report generator
│   │   │   ├── EventLogPanel.jsx          # Real-time control plane telemetry log stream
│   │   │   └── AddNodeModal.jsx           # Add custom router dialog
│   │   ├── App.jsx                        # Root application component & layout state
│   │   └── index.css                      # Spotify OLED Dark master theme & animations
│   ├── package.json
│   └── vite.config.js
├── docker/
│   ├── Dockerfile                  # Privileged multi-stage Ubuntu 22.04 with Mininet & OVS
│   └── entrypoint.sh               # OVS daemon startup, mn -c pre-flight & server launch
├── k8s/
│   ├── deployment.yaml             # Kubernetes privileged pod with NET_ADMIN/SYS_ADMIN
│   ├── service.yaml                # NodePort service exposing port 8000
│   └── kustomization.yaml
├── docker-compose.yml              # Privileged container specification
├── run_server.py                   # Root Python launcher
├── start.bat                       # 1-click Windows launcher
├── start.sh                        # Linux/macOS launcher
└── README.md
```

---

## Quickstart Guide

### Option 1: Run Locally (Host Machine)

#### Prerequisites
- Python 3.10+
- Node.js 18+ (if modifying frontend)

#### 1. Install Backend Dependencies
```bash
python -m venv venv
# On Windows:
venv\Scripts\activate
# On Linux/macOS:
source venv/bin/activate

pip install -r backend/requirements.txt
```

#### 2. Run Verification Tests
```bash
python -m backend.verify_sim
python -m unittest backend.test_server_api backend.test_websocket
```

#### 3. Start the Simulator Server
```bash
python run_server.py
```
Open your browser at **http://localhost:8000** to access the complete interactive dashboard.

*(Optional for Frontend Development with Hot Module Replacement)*:
```bash
cd frontend
npm install
npm run dev
```
Access the Vite dev server at **http://localhost:5173**.

---

### Option 2: Run with Docker Compose (Full Mininet & OVS Support)

The Docker container runs as `--privileged` with `NET_ADMIN` and `SYS_ADMIN` capabilities, enabling native Open vSwitch and Linux kernel network namespaces.

```bash
docker-compose up --build
```
Open **http://localhost:8000** in your browser.

---

### Option 3: Deploy to Kubernetes

```bash
kubectl apply -k k8s/
```
Check pod and service status:
```bash
kubectl get pods -l app=routing-convergence-simulator
kubectl get svc routing-simulator-service
```
Access via NodePort `http://<Node-IP>:30800` or port-forward:
```bash
kubectl port-forward svc/routing-simulator-service 8000:8000
```

---

### Option 4: Deploy Live to Cloud (Render / Railway / PaaS)

The repository is pre-configured for 1-click cloud deployment with dynamic `$PORT` routing and real-time WebSocket telemetry (`wss://`).

#### Deploy on Render (Free Web Service)
1. Go to [render.com](https://render.com) and log in with GitHub.
2. Click **New +** → **Web Service** → Connect your repository `mohargorai/routing-convergence-simulator`.
3. Render automatically detects the root `Dockerfile` and `render.yaml`.
4. Click **Create Web Service**. Render builds the container, allocates a free HTTPS/WSS domain (`https://<app-name>.onrender.com`), and automatically redeploys whenever you push to `main`.

#### Deploy on Railway
1. Go to [railway.app](https://railway.app) and click **New Project** → **Deploy from GitHub repo**.
2. Select `routing-convergence-simulator`. Railway builds the multi-stage Dockerfile and provisions a live public URL (`https://<app-name>.up.railway.app`).

---

## Demonstrating Count-to-Infinity & Poison Reverse

To reproduce the classic Distance Vector Count-to-Infinity pathology:
1. Select the **Count-to-Infinity Trap (Line)** preset: Topology `A -- B -- C`.
2. Set protocol to **Distance Vector (RIP)**.
3. Uncheck **Split Horizon** and uncheck **Poison Reverse**.
4. Step until converged (Tick 2: cost from A to C is 2 via B).
5. Click link **B--C** to sever it (`DOWN`).
6. Click **Step Tick** repeatedly:
   - Observe Node B accepting Node A's stale route to C with cost `1 + 2 = 3`.
   - Node A then updates its route via B to cost `1 + 3 = 4`.
   - The cost progressively counts up (`3, 4, 5, 6, 7, ...`) until reaching metric 16.
   - The UI flags `COUNT-TO-INFINITY LOOP DETECTED` in bright red alerts.
7. Now reset and check **Split Horizon** & **Poison Reverse**:
   - Sever link **B--C**.
   - Notice that Node B poisons the route at metric 16 immediately, preventing the two-node routing loop and stabilizing within 2 ticks!

---

## Verification Test Results

```
============================================================
STARTING AUTONOMOUS ROUTING SIMULATOR VERIFICATION SUITE
============================================================

--- TEST 1: Topology Graph Mutations ---
  [PASS] Triangle contains 3 nodes (A, B, C)
  [PASS] Triangle contains 3 links
  [PASS] Link A--B cost updated to 15
  [PASS] Link A--C toggled to down
  [PASS] Node C excluded from A's active neighbors when link is down
  [PASS] Link A--C restored to up

--- TEST 2: Link State (OSPF / Dijkstra) Convergence & SPF ---
  [PASS] Link State converged in 2 ticks
  [PASS] A -> C shortest path cost is 3 (1+2), actual: 3
  [PASS] A -> C next_hop is B, actual: B
  [PASS] A -> C path is A-B-C, actual: ['A', 'B', 'C']
  Mutating link A-B cost to 10...
  [PASS] Link State detected topology change and un-converged
  [PASS] Link State re-converged after link cost mutation in 2 ticks
  [PASS] A -> C shortest path switched to direct link (cost 5), actual: 5
  [PASS] A -> C next_hop is now direct C, actual: C

--- TEST 3: Distance Vector (Bellman-Ford / RIP) Convergence ---
  [PASS] Distance Vector converged in 2 ticks
  [PASS] A -> C optimal cost is 3, actual: 3
  [PASS] A -> C next_hop is B, actual: B

--- TEST 4: Count-to-Infinity & Split Horizon / Poison Reverse ---
  [PASS] Initial route A -> C cost is 2
  Simulating catastrophic link break on B--C with NO Split Horizon...
  [PASS] Count-to-Infinity detected 12 routing loops during link outage
  Observed sequential cost inflation: [(3, 4), (5, 4), (5, 6), (7, 6), (7, 8), (9, 8)]
  Testing WITH Split Horizon & Poison Reverse...
  [PASS] Poison Reverse stabilized network in 2 ticks
  [PASS] B dropped route to C (cost = 16 >= 16)
  [PASS] A dropped route to C (cost = 16 >= 16)

--- TEST 5: Dual-Protocol Side-by-Side Comparison ---
  [PASS] Report contains both LS and DV telemetry
  [PASS] Link State converged in comparison run
  [PASS] Distance Vector converged in comparison run

--- TEST 6: Mininet Bridge and Failsafe Cleanup ---
  [PASS] Mininet bridge reports engine_mode: emulated_network_namespaces
  [PASS] Bridge tracks active router interfaces
  [PASS] Ping test executed successfully across router nodes
  [PASS] Mininet bridge cleaned up and inactive

============================================================
ALL VERIFICATION TEST SUITES PASSED WITH ZERO ERRORS
============================================================
```


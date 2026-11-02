"""
Launcher for Routing Convergence Simulator Backend and Web Dashboard.
Usage:
    python run_server.py [--port 8000] [--host 0.0.0.0]
"""
import argparse
import sys
import uvicorn

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Routing Convergence Simulator Server")
    parser.add_argument("--host", default="0.0.0.0", help="Host interface (default: 0.0.0.0)")
    parser.add_argument("--port", type=int, default=8000, help="Port to listen on (default: 8000)")
    parser.add_argument("--reload", action="store_true", help="Enable auto-reload on code change")
    args = parser.parse_args()

    print(f"[*] Starting Routing Convergence Simulator on http://{args.host}:{args.port}")
    uvicorn.run("backend.server:app", host=args.host, port=args.port, reload=args.reload)


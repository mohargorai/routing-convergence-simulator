"""
Automated Verification Suite for Link State & Distance Vector Convergence Simulator.
Autonomous testing covering:
1. Deterministic Link State Dijkstra shortest paths and LSA flooding
2. Distance Vector Bellman-Ford iteration and route updates
3. Split Horizon and Poison Reverse suppression of Count-to-Infinity loops
4. Link failure and dynamic cost mutation re-convergence
5. Dual-Protocol comparative benchmarking
6. Mininet bridge status and fail-safe cleanup validation
"""
import sys
import time
from backend.engine.topology import Topology
from backend.engine.link_state import LinkStateEngine
from backend.engine.distance_vector import DistanceVectorEngine
from backend.engine.simulator import SimulationCoordinator
from backend.engine.mininet_bridge import bridge


def assert_true(condition: bool, msg: str) -> None:
    if not condition:
        raise AssertionError(f"FAILED: {msg}")
    print(f"  [PASS] {msg}")


def test_topology_mutations():
    print("\n--- TEST 1: Topology Graph Mutations ---")
    topo = Topology.preset_triangle()
    assert_true(len(topo.nodes) == 3, "Triangle contains 3 nodes (A, B, C)")
    assert_true(len(topo.links) == 3, "Triangle contains 3 links")

    # Mutate link
    topo.set_link_cost("A", "B", 15)
    link = topo.links["A--B"]
    assert_true(link.cost == 15, "Link A--B cost updated to 15")

    # Toggle link status
    new_st = topo.toggle_link("A", "C")
    assert_true(new_st == "down", "Link A--C toggled to down")
    neighbors_a = topo.get_neighbors("A", only_up=True)
    assert_true("C" not in neighbors_a, "Node C excluded from A's active neighbors when link is down")

    # Recover link
    new_st2 = topo.toggle_link("A", "C")
    assert_true(new_st2 == "up", "Link A--C restored to up")


def test_link_state_spf_correctness():
    print("\n--- TEST 2: Link State (OSPF / Dijkstra) Convergence & SPF ---")
    topo = Topology.preset_triangle()
    # A-B: 1, B-C: 2, A-C: 5
    ls = LinkStateEngine(topo)

    # Step until converged
    step_count = 0
    while not ls.is_converged and step_count < 20:
        ls.step()
        step_count += 1

    assert_true(ls.is_converged, f"Link State converged in {step_count} ticks")
    table_a = ls.nodes["A"].routing_table
    assert_true(table_a["C"]["cost"] == 3, f"A -> C shortest path cost is 3 (1+2), actual: {table_a['C']['cost']}")
    assert_true(table_a["C"]["next_hop"] == "B", f"A -> C next_hop is B, actual: {table_a['C']['next_hop']}")
    assert_true(table_a["C"]["path"] == ["A", "B", "C"], f"A -> C path is A-B-C, actual: {table_a['C']['path']}")

    # Mutate link cost dynamically
    print("  Mutating link A-B cost to 10...")
    topo.set_link_cost("A", "B", 10)
    ls.notify_topology_changed()
    assert_true(not ls.is_converged, "Link State detected topology change and un-converged")

    step_count = 0
    while not ls.is_converged and step_count < 20:
        ls.step()
        step_count += 1

    assert_true(ls.is_converged, f"Link State re-converged after link cost mutation in {step_count} ticks")
    table_a = ls.nodes["A"].routing_table
    # Now direct link A-C (cost 5) should beat A-B-C (10+2=12)
    assert_true(table_a["C"]["cost"] == 5, f"A -> C shortest path switched to direct link (cost 5), actual: {table_a['C']['cost']}")
    assert_true(table_a["C"]["next_hop"] == "C", f"A -> C next_hop is now direct C, actual: {table_a['C']['next_hop']}")


def test_distance_vector_convergence():
    print("\n--- TEST 3: Distance Vector (Bellman-Ford / RIP) Convergence ---")
    topo = Topology.preset_triangle()
    dv = DistanceVectorEngine(topo, split_horizon=True, poison_reverse=True)

    step_count = 0
    while not dv.is_converged and step_count < 25:
        dv.step()
        step_count += 1

    assert_true(dv.is_converged, f"Distance Vector converged in {step_count} ticks")
    table_a = dv.nodes["A"].routing_table
    assert_true(table_a["C"].cost == 3, f"A -> C optimal cost is 3, actual: {table_a['C'].cost}")
    assert_true(table_a["C"].next_hop == "B", f"A -> C next_hop is B, actual: {table_a['C'].next_hop}")


def test_count_to_infinity_mitigation():
    print("\n--- TEST 4: Count-to-Infinity & Split Horizon / Poison Reverse ---")
    # Linear topology: A - B - C
    # Part A: Without Split Horizon or Poison Reverse (triggers count-to-infinity)
    topo_loop = Topology.preset_count_to_infinity()
    dv_loop = DistanceVectorEngine(topo_loop, split_horizon=False, poison_reverse=False, infinity_metric=16)

    # Converge initially
    while not dv_loop.is_converged:
        dv_loop.step()

    assert_true(dv_loop.nodes["A"].routing_table["C"].cost == 2, "Initial route A -> C cost is 2")

    # Break link B-C!
    print("  Simulating catastrophic link break on B--C with NO Split Horizon...")
    topo_loop.set_link_status("B", "C", "down")
    dv_loop.notify_topology_changed()

    # Step multiple ticks and watch the cost increase progressively
    costs_observed = []
    for _ in range(6):
        dv_loop.step()
        cost_b_to_c = dv_loop.nodes["B"].routing_table["C"].cost
        cost_a_to_c = dv_loop.nodes["A"].routing_table["C"].cost
        costs_observed.append((cost_b_to_c, cost_a_to_c))

    loop_count = len(dv_loop.count_to_infinity_events)
    assert_true(loop_count > 0, f"Count-to-Infinity detected {loop_count} routing loops during link outage")
    print(f"  Observed sequential cost inflation: {costs_observed}")

    # Part B: With Split Horizon & Poison Reverse
    print("  Testing WITH Split Horizon & Poison Reverse...")
    topo_safe = Topology.preset_count_to_infinity()
    dv_safe = DistanceVectorEngine(topo_safe, split_horizon=True, poison_reverse=True, infinity_metric=16)

    while not dv_safe.is_converged:
        dv_safe.step()

    # Break link B-C
    topo_safe.set_link_status("B", "C", "down")
    dv_safe.notify_topology_changed()

    # Step until converged
    step_safe = 0
    while not dv_safe.is_converged and step_safe < 10:
        dv_safe.step()
        step_safe += 1

    assert_true(dv_safe.is_converged, f"Poison Reverse stabilized network in {step_safe} ticks")
    cost_b_to_c_safe = dv_safe.nodes["B"].routing_table["C"].cost
    cost_a_to_c_safe = dv_safe.nodes["A"].routing_table["C"].cost
    assert_true(cost_b_to_c_safe >= 16, f"B dropped route to C (cost = {cost_b_to_c_safe} >= 16)")
    assert_true(cost_a_to_c_safe >= 16, f"A dropped route to C (cost = {cost_a_to_c_safe} >= 16)")


def test_dual_protocol_comparison():
    print("\n--- TEST 5: Dual-Protocol Side-by-Side Comparison ---")
    coord = SimulationCoordinator(initial_preset="diamond")
    report = coord.run_dual_comparison()

    assert_true("link_state" in report and "distance_vector" in report, "Report contains both LS and DV telemetry")
    assert_true(report["link_state"]["converged"], "Link State converged in comparison run")
    assert_true(report["distance_vector"]["converged"], "Distance Vector converged in comparison run")
    print(f"  Comparison Verdict: {report['verdict']}")
    print(f"  Link State: {report['link_state']['ticks']} ticks, {report['link_state']['control_packets']} packets")
    print(f"  Distance Vector: {report['distance_vector']['ticks']} ticks, {report['distance_vector']['control_packets']} packets")


def test_mininet_bridge_and_cleanup():
    print("\n--- TEST 6: Mininet Bridge and Failsafe Cleanup ---")
    status = bridge.get_status()
    assert_true("engine_mode" in status, f"Mininet bridge reports engine_mode: {status['engine_mode']}")
    assert_true("active_routers" in status, "Bridge tracks active router interfaces")

    # Test route sync
    bridge.sync_routes("A", {"B": {"next_hop": "B", "cost": 1}, "C": {"next_hop": "B", "cost": 3}})
    # Test ping test
    ping_res = bridge.ping_test("A", "B")
    assert_true(ping_res["success"], "Ping test executed successfully across router nodes")

    # Run cleanup
    bridge.cleanup()
    assert_true(not bridge.is_active, "Mininet bridge cleaned up and inactive")


def run_all_verification_tests():
    print("=" * 60)
    print("STARTING AUTONOMOUS ROUTING SIMULATOR VERIFICATION SUITE")
    print("=" * 60)
    start_time = time.time()

    test_topology_mutations()
    test_link_state_spf_correctness()
    test_distance_vector_convergence()
    test_count_to_infinity_mitigation()
    test_dual_protocol_comparison()
    test_mininet_bridge_and_cleanup()

    elapsed = round(time.time() - start_time, 3)
    print("\n" + "=" * 60)
    print(f"ALL 6 VERIFICATION TEST SUITES PASSED IN {elapsed}s WITH ZERO ERRORS!")
    print("=" * 60)


if __name__ == "__main__":
    run_all_verification_tests()


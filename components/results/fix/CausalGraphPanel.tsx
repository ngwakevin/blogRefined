"use client";

import { useEffect, useMemo, useState } from "react";
import type { CausalGraph } from "@/types/redefined";

type CausalGraphPanelProps = {
  graph?: CausalGraph;
};

export function CausalGraphPanel({ graph }: CausalGraphPanelProps) {
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [activeStepIndex, setActiveStepIndex] = useState<number | null>(null);
  const [isSimulating, setIsSimulating] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  const selectedNode = useMemo(
    () => graph?.nodes.find((node) => node.id === selectedNodeId) ?? null,
    [graph?.nodes, selectedNodeId]
  );
  const activeStep =
    activeStepIndex === null ? null : graph?.simulationSteps[activeStepIndex] ?? null;

  useEffect(() => {
    if (!isSimulating || !graph?.simulationSteps.length) return;
    if (activeStepIndex === null) return;

    const timeout = window.setTimeout(() => {
      setActiveStepIndex((current) => {
        const next = (current ?? 0) + 1;
        if (next >= graph.simulationSteps.length) {
          setIsSimulating(false);
          return current;
        }
        return next;
      });
    }, 1050);

    return () => window.clearTimeout(timeout);
  }, [activeStepIndex, graph?.simulationSteps.length, isSimulating]);

  if (!graph) return null;

  const activeIds = new Set(activeStep?.activeNodeIds ?? []);
  const failingIds = new Set(activeStep?.failingNodeIds ?? []);
  const passingIds = new Set(activeStep?.passingNodeIds ?? []);
  const activeBranchId = activeStep?.branchId;
  const selectedBranch = graph.branches?.find((branch) => branch.nodeIds.includes(selectedNodeId ?? ""));
  const nodePositions = new Map(
    graph.nodes.map((node, index) => [
      node.id,
      {
        x: node.x ?? 10 + index * 14,
        y: node.y ?? 44
      }
    ])
  );

  function startSimulation() {
    setSelectedNodeId(null);
    setActiveStepIndex(0);
    setIsSimulating(true);
  }

  function reset() {
    setSelectedNodeId(null);
    setActiveStepIndex(null);
    setIsSimulating(false);
  }

  function openRunbook() {
    document.querySelector(".diagnostic-terminal")?.scrollIntoView({
      behavior: "smooth",
      block: "start"
    });
  }

  return (
    <section
      className={`causal-graph-panel ${isExpanded ? "expanded" : ""}`}
      aria-label="Live causal graph"
    >
      <div className="causal-graph-header">
        <div className="causal-graph-title">
          <p className="block-label">Why layer</p>
          <h3>Live causal graph</h3>
          <p>See how the likely failure propagates through the request path.</p>
        </div>
        <span>Confidence: {graph.confidence}</span>
      </div>

      {graph.branches?.length ? (
        <div className="causal-branch-pills" aria-label="Causal branches">
          {graph.branches.map((branch) => (
            <button
              className={`branch-${branch.tone} ${activeBranchId === branch.id ? "active" : ""}`}
              key={branch.id}
              type="button"
              onClick={() => setSelectedNodeId(branch.nodeIds[0] ?? null)}
            >
              {branch.label}
            </button>
          ))}
        </div>
      ) : null}

      <div className="causal-graph-stage">
        <svg
          className="causal-graph-svg"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <defs>
            <marker
              id="causal-arrow"
              markerHeight="7"
              markerWidth="7"
              orient="auto"
              refX="6"
              refY="3.5"
            >
              <path d="M0,0 L7,3.5 L0,7 Z" />
            </marker>
          </defs>
          {graph.edges.map((edge) => {
            const from = nodePositions.get(edge.from);
            const to = nodePositions.get(edge.to);
            if (!from || !to) return null;
            const dx = to.x - from.x;
            const dy = to.y - from.y;
            const curve = Math.abs(dy) > 16 ? 12 : 0;
            const path =
              curve > 0
                ? `M ${from.x} ${from.y} C ${from.x + dx / 2} ${from.y + curve}, ${to.x - dx / 2} ${to.y - curve}, ${to.x} ${to.y}`
                : `M ${from.x} ${from.y} L ${to.x} ${to.y}`;

            return (
              <path
                className={`causal-svg-edge causal-edge-${edge.kind ?? "dependency"}`}
                d={path}
                key={`${edge.from}-${edge.to}`}
                markerEnd="url(#causal-arrow)"
              />
            );
          })}
        </svg>
        <div className="causal-graph-canvas">
          {graph.nodes.map((node, index) => {
            const isActive = activeIds.has(node.id);
            const isFailing = failingIds.has(node.id) || node.status === "failing";
            const isPassing = passingIds.has(node.id) || node.status === "passing";
            const isSelected = selectedNodeId === node.id;
            const position = nodePositions.get(node.id) ?? { x: 10 + index * 14, y: 44 };

            return (
              <button
                className={[
                  "causal-node",
                  isActive ? "causal-node-active" : "",
                  isFailing ? "causal-node-failing" : "",
                  isPassing ? "causal-node-passing" : "",
                  isSelected ? "causal-node-selected" : ""
                ]
                  .filter(Boolean)
                  .join(" ")}
                key={node.id}
                style={{ left: `${position.x}%`, top: `${position.y}%` }}
                type="button"
                onClick={() => setSelectedNodeId(node.id)}
              >
                <span>{String(index + 1).padStart(2, "0")}</span>
                <strong>{node.label}</strong>
                {node.subtitle ? <em>{node.subtitle}</em> : null}
              </button>
            );
          })}
        </div>
      </div>

      <div className="causal-inspector">
        <div>
          <p className="block-label">{activeStep ? "Simulation step" : "Inspector"}</p>
          <h4>{activeStep?.title ?? selectedNode?.label ?? "Select a node or simulate failure"}</h4>
          <p>
            {activeStep?.description ??
              (selectedNode
                ? `${selectedNode.subtitle ?? "This node is part of the causal chain."}${selectedBranch ? ` Related branch: ${selectedBranch.label}.` : ""}`
                : "Select a node to inspect why it matters.")}
          </p>
        </div>

        <div className="causal-controls">
          <button type="button" onClick={startSimulation}>
            Simulate failure
          </button>
          <button type="button" onClick={reset}>
            Reset
          </button>
          <button type="button" onClick={openRunbook}>
            Open runbook
          </button>
          <button type="button" onClick={() => setIsExpanded((current) => !current)}>
            {isExpanded ? "Compact graph" : "Expand graph"}
          </button>
        </div>
      </div>

      {graph.simulationSteps.length > 0 ? (
        <div className="causal-progress">
          {graph.simulationSteps.map((step, index) => (
            <span
              aria-label={step.title}
              className={activeStepIndex === index ? "active" : ""}
              key={step.id}
            />
          ))}
        </div>
      ) : null}
    </section>
  );
}

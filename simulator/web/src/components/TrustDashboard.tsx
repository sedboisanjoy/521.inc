import { useRef, useEffect } from "react";
import * as d3 from "d3";
import type { Org } from "../types";

interface Props {
  orgs: Org[];
}

export function TrustDashboard({ orgs }: Props) {
  const chartRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!chartRef.current) return;
    const svg = d3.select(chartRef.current);
    svg.selectAll("*").remove();

    const w = 500, h = 200, barH = 32, gap = 12;
    svg.attr("width", w).attr("height", Math.max(h, orgs.length * (barH + gap) + 40));

    const sorted = [...orgs].sort((a, b) => b.score - a.score);

    // Background grid
    for (let s = 0; s <= 100; s += 20) {
      const x = (s / 100) * (w - 160) + 120;
      svg.append("line")
        .attr("x1", x).attr("x2", x).attr("y1", 0)
        .attr("y2", sorted.length * (barH + gap) + 20)
        .attr("stroke", "#333").attr("stroke-dasharray", "2,2");
      svg.append("text")
        .attr("x", x).attr("y", 14)
        .attr("fill", "#888").attr("font-size", 10).attr("text-anchor", "middle")
        .text(s);
    }

    sorted.forEach((org, i) => {
      const y = i * (barH + gap) + 25;
      const barW = (org.score / 100) * (w - 160);

      // Label
      svg.append("text")
        .attr("x", 115).attr("y", y + barH / 2 + 4)
        .attr("fill", "#c0c0c0").attr("font-size", 11).attr("text-anchor", "end")
        .text(org.name.length > 18 ? org.name.slice(0, 18) + "…" : org.name);

      // Bar
      const color = org.score >= 70 ? "#2ecc71" : org.score >= 40 ? "#f39c12" : "#e74c3c";
      svg.append("rect")
        .attr("x", 120).attr("y", y)
        .attr("width", 0).attr("height", barH).attr("rx", 4)
        .attr("fill", color).attr("opacity", 0.85)
        .transition().duration(800).delay(i * 100)
        .attr("width", barW);

      // Score number
      svg.append("text")
        .attr("x", 125).attr("y", y + barH / 2 + 4)
        .attr("fill", "#fff").attr("font-size", 12).attr("font-weight", "bold")
        .text(org.online ? org.score.toFixed(0) : "OFF");
    });
  }, [orgs]);

  return (
    <div className="panel">
      <div className="panel-header">
        <h2>⭐ Trust Score Dashboard (Live Agency Standing)</h2>
        <span className="panel-hint">Derived from ledger events — cannot be self-asserted</span>
      </div>
      <div className="trust-chart">
        <svg ref={chartRef}></svg>
      </div>
      <div className="trust-legend">
        <span className="trust-item">🟢 ≥ 70 — Trusted</span>
        <span className="trust-item">🟠 40-69 — Review</span>
        <span className="trust-item">🔴 {"< 40"} — Reject</span>
      </div>
    </div>
  );
}
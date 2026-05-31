// StatCard, Chart, Panel — dashboard pieces
function StatCard({ label, value, delta, deltaDir, note, accent }) {
  return (
    <div className="stat-card">
      <div className="label">{label}</div>
      <div className="value" style={accent ? { color: "var(--accent)" } : {}}>{value}</div>
      <div className="delta">
        {deltaDir && <span className={deltaDir === "up" ? "up" : "down"}>{deltaDir === "up" ? "↑" : "↓"} {delta}</span>}
        {deltaDir && note && " · "}
        {note}
      </div>
    </div>
  );
}

function Panel({ title, meta, children, action }) {
  return (
    <div className="panel">
      <div className="panel-head">
        <div className="title">{title}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {meta && <div className="meta">{meta}</div>}
          {action}
        </div>
      </div>
      <div className="panel-body">{children}</div>
    </div>
  );
}

// Sparkline-ish area chart in pure SVG
function AreaChart({ data, w = 720, h = 180 }) {
  const max = Math.max(...data) * 1.15;
  const min = 0;
  const stepX = w / (data.length - 1);
  const pts = data.map((v, i) => [i * stepX, h - ((v - min) / (max - min)) * (h - 24) - 8]);
  const linePath = pts.map((p, i) => (i === 0 ? "M" : "L") + p[0].toFixed(1) + "," + p[1].toFixed(1)).join(" ");
  const areaPath = linePath + ` L${w},${h} L0,${h} Z`;
  const gridLines = [0.25, 0.5, 0.75].map(f => h - f * (h - 24) - 8);
  return (
    <svg className="chart" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
      <defs>
        <linearGradient id="amberGrad" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.25"/>
          <stop offset="100%" stopColor="#f59e0b" stopOpacity="0"/>
        </linearGradient>
      </defs>
      <g className="chart-grid">
        {gridLines.map((y, i) => <line key={i} x1="0" x2={w} y1={y} y2={y} />)}
      </g>
      <path d={areaPath} className="chart-area" />
      <path d={linePath} className="chart-line" />
    </svg>
  );
}

window.StatCard = StatCard;
window.Panel = Panel;
window.AreaChart = AreaChart;

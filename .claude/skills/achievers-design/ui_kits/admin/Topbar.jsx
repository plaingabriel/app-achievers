// Topbar — breadcrumb + global search + notifications
function Topbar({ crumbs = [] }) {
  return (
    <header className="topbar">
      <div className="crumb">
        {crumbs.map((c, i) => (
          <React.Fragment key={i}>
            {i > 0 && <span className="sep">/</span>}
            <span className={i === crumbs.length - 1 ? "here" : ""}>{c}</span>
          </React.Fragment>
        ))}
      </div>
      <div className="spacer"></div>
      <div className="search">
        <Icon name="search" size={12} />
        <span>Search achievements, members…</span>
        <span className="kbd">⌘K</span>
      </div>
      <button className="btn btn-ghost btn-icon" title="Notifications">
        <Icon name="bell" size={14} />
      </button>
    </header>
  );
}
window.Topbar = Topbar;

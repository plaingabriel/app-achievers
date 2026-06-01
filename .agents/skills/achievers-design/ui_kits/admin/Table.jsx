// Members table — with toolbar, sortable columns, row selection
function MembersTable({ rows, selected, onSelect }) {
  return (
    <div className="panel">
      <div className="toolbar">
        <input className="input" placeholder="Filter by name, email, role…" />
        <button className="btn btn-sm">
          <Icon name="filter" size={12} />
          Filter
        </button>
        <button className="btn btn-sm">
          Role <Icon name="down" size={12} />
        </button>
        <button className="btn btn-sm">
          Status <Icon name="down" size={12} />
        </button>
        <div className="spacer"></div>
        <span className="muted" style={{ fontSize: 11, color: 'var(--fg-3)' }}>
          {rows.length} of 1,247
        </span>
        <button className="btn btn-sm btn-primary">
          <Icon name="plus" size={12} />
          Add member
        </button>
      </div>
      <table className="tbl">
        <thead>
          <tr>
            <th style={{ width: 32 }}></th>
            <th>Member</th>
            <th>Role</th>
            <th>Status</th>
            <th>Achievements</th>
            <th>Last seen</th>
            <th style={{ width: 32 }}></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={r.id}
              className={selected === r.id ? 'selected' : ''}
              onClick={() => onSelect(r.id)}
            >
              <td>
                <input type="checkbox" />
              </td>
              <td>
                {r.handle} <span className="muted">· #{r.id}</span>
              </td>
              <td>{r.role}</td>
              <td>
                <Pill kind={r.statusKind}>{r.status}</Pill>
              </td>
              <td className="num">{r.achievements}</td>
              <td className="muted">{r.seen}</td>
              <td>
                <Icon name="more" size={14} style={{ color: 'var(--fg-3)' }} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Pill({ kind, children }) {
  const color = {
    success: '#22c55e',
    warning: '#f59e0b',
    danger: '#ef4444',
    info: '#3b82f6',
    idle: 'var(--fg-3)',
  }[kind];
  return (
    <span className={'pill pill-' + kind}>
      <span className="dot" style={{ background: color }}></span>
      {children}
    </span>
  );
}

window.MembersTable = MembersTable;
window.Pill = Pill;

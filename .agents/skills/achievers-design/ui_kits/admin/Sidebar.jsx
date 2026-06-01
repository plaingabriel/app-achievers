// Sidebar — fixed left nav
function Sidebar({ active, onNavigate }) {
  const main = [
    { key: 'dashboard', icon: 'home', label: 'Dashboard' },
    { key: 'members', icon: 'users', label: 'Members', count: 1247 },
    { key: 'achievements', icon: 'trophy', label: 'Achievements', count: 38 },
    { key: 'analytics', icon: 'chart', label: 'Analytics' },
    { key: 'logs', icon: 'logs', label: 'Audit log' },
  ];
  const setup = [
    { key: 'keys', icon: 'key', label: 'API keys' },
    { key: 'settings', icon: 'settings', label: 'Settings' },
  ];

  const Item = (it) => (
    <div
      key={it.key}
      className={'nav-item ' + (active === it.key ? 'active' : '')}
      onClick={() => onNavigate && onNavigate(it.key)}
    >
      <span className="indicator"></span>
      <Icon name={it.icon} size={14} />
      <span>{it.label}</span>
      {it.count != null && <span className="count">{it.count.toLocaleString()}</span>}
    </div>
  );

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <div className="brand-lockup">
          <svg viewBox="0 0 64 64" width="22" height="22" fill="none" aria-hidden="true">
            <path
              d="M19 11 L19.9 13.1 L22 14 L19.9 14.9 L19 17 L18.1 14.9 L16 14 L18.1 13.1 Z"
              fill="#f59e0b"
            />
            <path
              d="M32 7 L33.3 10.2 L36.5 11.5 L33.3 12.8 L32 16 L30.7 12.8 L27.5 11.5 L30.7 10.2 Z"
              fill="#f59e0b"
            />
            <path
              d="M45 11 L45.9 13.1 L48 14 L45.9 14.9 L45 17 L44.1 14.9 L42 14 L44.1 13.1 Z"
              fill="#f59e0b"
            />
            <path
              d="M14 22 L27 22 L32 27 L37 22 L50 22 L50 54 L37 54 L32 59 L27 54 L14 54 Z"
              stroke="#f59e0b"
              strokeWidth="2"
              strokeLinejoin="miter"
              fill="none"
            />
          </svg>
          <div className="wordmark">achievers</div>
        </div>
        <div className="env">prod · us-east-1</div>
      </div>
      <div className="nav-section">
        <div className="label">Workspace</div>
        {main.map(Item)}
      </div>
      <div className="nav-section">
        <div className="label">Setup</div>
        {setup.map(Item)}
      </div>
      <div className="sidebar-footer">
        <div className="avatar">tc</div>
        <div className="meta">
          <span className="name">taylor.chen</span>
          <span className="role">Admin</span>
        </div>
      </div>
    </aside>
  );
}
window.Sidebar = Sidebar;

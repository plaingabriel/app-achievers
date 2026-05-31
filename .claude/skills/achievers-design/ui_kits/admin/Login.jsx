// Login screen
function Login({ onSignIn }) {
  const [email, setEmail] = React.useState("taylor@achievers.app");
  const [pw, setPw] = React.useState("");
  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-brand">
          <svg viewBox="0 0 64 64" width="34" height="34" fill="none" aria-hidden="true" style={{ marginRight: 12, verticalAlign: "middle" }}>
            <path d="M19 11 L19.9 13.1 L22 14 L19.9 14.9 L19 17 L18.1 14.9 L16 14 L18.1 13.1 Z" fill="#f59e0b"/>
            <path d="M32 7 L33.3 10.2 L36.5 11.5 L33.3 12.8 L32 16 L30.7 12.8 L27.5 11.5 L30.7 10.2 Z" fill="#f59e0b"/>
            <path d="M45 11 L45.9 13.1 L48 14 L45.9 14.9 L45 17 L44.1 14.9 L42 14 L44.1 13.1 Z" fill="#f59e0b"/>
            <path d="M14 22 L27 22 L32 27 L37 22 L50 22 L50 54 L37 54 L32 59 L27 54 L14 54 Z" stroke="#f59e0b" strokeWidth="2" strokeLinejoin="miter" fill="none"/>
          </svg>
          <span style={{ verticalAlign: "middle" }}>achievers</span>
        </div>
        <div className="login-title">Sign in to your workspace</div>
        <div className="login-sub">Use your work email. SSO is available for enterprise.</div>

        <div className="field">
          <label className="label">Email</label>
          <input className="input" value={email} onChange={e => setEmail(e.target.value)} />
        </div>
        <div className="field">
          <label className="label">Password</label>
          <input className="input" type="password" value={pw} onChange={e => setPw(e.target.value)} placeholder="••••••••••" />
        </div>

        <button className="btn btn-primary btn-lg" style={{ width: "100%", justifyContent: "center" }} onClick={onSignIn}>
          Continue <Icon name="right" size={14} />
        </button>

        <div className="login-foot">
          <a href="#">Forgot password</a>
          <a href="#">Sign in with SSO →</a>
        </div>
      </div>
    </div>
  );
}
window.Login = Login;

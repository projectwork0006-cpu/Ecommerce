export default function Nav({ cartCount, navigate }) {
  return (
    <nav className="nav">
      <div className="container nav-inner">
        <button className="nav-logo" onClick={() => navigate("/")}>
          Shop<span>IQ</span>
        </button>
        <div className="nav-links">
          <button className="nav-link" onClick={() => navigate("/")}>Search</button>
          <button className="nav-link" onClick={() => navigate("/ab-dashboard")}>A/B Results</button>
          <button className="nav-cta" onClick={() => navigate("/")}>
            🛒 Cart {cartCount > 0 && `(${cartCount})`}
          </button>
        </div>
      </div>
    </nav>
  );
}

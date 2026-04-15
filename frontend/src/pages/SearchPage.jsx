import { useState, useEffect, useCallback, useRef } from "react";
import { searchProducts, logEvent } from "../api/client.js";
import SearchFilters from "../components/SearchFilters.jsx";
import ProductCard from "../components/ProductCard.jsx";

const SKELETON_COUNT = 8;

function SkeletonCard() {
  return (
    <div className="skeleton-card">
      <div className="skeleton skeleton-img" style={{ aspectRatio: "1" }} />
      <div className="skeleton-body">
        <div className="skeleton skeleton-line short" />
        <div className="skeleton skeleton-line long" />
        <div className="skeleton skeleton-line long" />
        <div className="skeleton skeleton-price" />
      </div>
    </div>
  );
}

export default function SearchPage({ userId, addToCart, addToast, navigate }) {
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState({});
  const [products, setProducts] = useState([]);
  const [facets, setFacets] = useState(null);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const debounceTimer = useRef(null);

  const fetchProducts = useCallback(async (f) => {
    setLoading(true);
    try {
      const result = await searchProducts(f);
      setProducts(result.products || []);
      setFacets(result.facets || null);
      setTotal(result.total || 0);
    } catch {
      addToast("Failed to load products", "error");
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  // Initial load
  useEffect(() => { fetchProducts({}); }, [fetchProducts]);

  // Debounced search on query change
  useEffect(() => {
    clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      const newFilters = { ...filters, q: query || undefined };
      setFilters(newFilters);
      fetchProducts(newFilters);
    }, 400);
    return () => clearTimeout(debounceTimer.current);
  }, [query]);

  const handleFiltersChange = (newFilters) => {
    setFilters(newFilters);
    fetchProducts(newFilters);
  };

  const handleProductClick = (product) => {
    logEvent({ user_id: userId, product_id: product.product_id, event_type: "view" });
    navigate(`/product/${product.product_id}`);
  };

  const handleAddToCart = (product) => {
    logEvent({ user_id: userId, product_id: product.product_id, event_type: "add_to_cart" });
    addToCart(product);
  };

  // Category pills from facets
  const categories = facets?.categories || [];

  return (
    <main style={{ padding: "0 0 var(--space-2xl)" }}>
      {/* ─── Hero ──────────────────────────────────────────────── */}
      <div className="hero">
        <div className="container">
          <div className="hero-badge">✨ AI-Powered Search</div>
          <h1 className="hero-title">
            Find exactly what<br />
            you <span className="gradient-text">need</span>
          </h1>
          <p className="hero-subtitle">
            Intelligent search with personalized recommendations, powered by AWS Lambda and DynamoDB.
          </p>

          {/* ─── Search Bar ───────────────────────────────────── */}
          <div className="search-wrapper">
            <div className="search-bar">
              <svg className="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                id="product-search-input"
                className="search-input"
                type="text"
                placeholder="Search products, categories, brands..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                autoComplete="off"
              />
              <button className="search-btn" onClick={() => fetchProducts({ ...filters, q: query })}>
                Search
              </button>
            </div>
          </div>

          {/* ─── Stats ────────────────────────────────────────── */}
          <div className="stats-bar" style={{ maxWidth: 700, margin: "0 auto" }}>
            <div className="stat-card">
              <div className="stat-icon purple">📦</div>
              <div>
                <div className="stat-value">{total.toLocaleString()}</div>
                <div className="stat-label">Products Found</div>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-icon emerald">🏷️</div>
              <div>
                <div className="stat-value">{categories.length}</div>
                <div className="stat-label">Categories</div>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-icon amber">⚡</div>
              <div>
                <div className="stat-value">&lt;50ms</div>
                <div className="stat-label">Avg Latency</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="container">
        {/* ─── Category Pills ──────────────────────────────── */}
        {categories.length > 0 && (
          <div className="category-pills">
            <button
              className={`category-pill ${!filters.category ? "active" : ""}`}
              onClick={() => handleFiltersChange({ ...filters, category: undefined })}
            >
              🌟 All
            </button>
            {categories.map((c) => (
              <button
                key={c.name}
                className={`category-pill ${filters.category === c.name ? "active" : ""}`}
                onClick={() => handleFiltersChange({ ...filters, category: c.name === filters.category ? undefined : c.name })}
              >
                {c.name} <span className="count">{c.count}</span>
              </button>
            ))}
          </div>
        )}

        {/* ─── Filters ────────────────────────────────────── */}
        <SearchFilters facets={facets} filters={filters} onFiltersChange={handleFiltersChange} />

        {/* ─── Results ────────────────────────────────────── */}
        <div className="section-header">
          <h2 className="section-title">
            {query ? `Results for "${query}"` : "All Products"}
          </h2>
          <span className="result-count">{total} products</span>
        </div>

        {loading ? (
          <div className="products-grid">
            {Array.from({ length: SKELETON_COUNT }).map((_, i) => <SkeletonCard key={i} />)}
          </div>
        ) : products.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">🔍</div>
            <div className="empty-state-title">No products found</div>
            <div className="empty-state-text">
              Try different keywords or clear the filters.
            </div>
          </div>
        ) : (
          <div className="products-grid">
            {products.map((p) => (
              <ProductCard
                key={p.product_id}
                product={p}
                onClick={handleProductClick}
                onAddToCart={handleAddToCart}
              />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}

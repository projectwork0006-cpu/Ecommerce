import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { getRecommendations, logEvent, logABClick, searchProducts } from "../api/client.js";
import RecommendationWidget from "../components/RecommendationWidget.jsx";

const EXPERIMENT_ID = "EXP-RECS-2024";

export default function ProductPage({ userId, addToCart, addToast, navigate }) {
  const { id } = useParams();
  const [product, setProduct] = useState(null);
  const [recommendations, setRecommendations] = useState([]);
  const [recVariant, setRecVariant] = useState(null);
  const [loading, setLoading] = useState(true);
  const [recLoading, setRecLoading] = useState(true);
  const [qty, setQty] = useState(1);

  // Load product from mock/API
  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const result = await searchProducts({});
        const found = result.products?.find((p) => p.product_id === id);
        setProduct(found || null);
        if (found) {
          logEvent({ user_id: userId, product_id: id, event_type: "view" });
        }
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [id, userId]);

  // Load recommendations
  useEffect(() => {
    if (!id) return;
    setRecLoading(true);
    getRecommendations({ product_id: id, user_id: userId, limit: 8 })
      .then((data) => {
        setRecommendations(data.recommendations || []);
        setRecVariant(data.variant || "advanced");
      })
      .finally(() => setRecLoading(false));
  }, [id, userId]);

  const handleAddToCart = () => {
    if (!product) return;
    logEvent({ user_id: userId, product_id: product.product_id, event_type: "add_to_cart" });
    addToCart({ ...product, qty });
    addToast(`🛒 ${product.product_name} × ${qty} added to cart`);
  };

  const handleRecClick = (rec) => {
    logABClick({
      experiment_id: EXPERIMENT_ID,
      variant: recVariant,
      user_id: userId,
      product_id: rec.product_id,
    });
    navigate(`/product/${rec.product_id}`);
  };

  const stars = product ? Math.round((product.popularity_score / 100) * 5 * 10) / 10 : 0;

  if (loading) {
    return (
      <main className="container" style={{ padding: "var(--space-xl) var(--space-lg)" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-xl)" }}>
          <div className="skeleton" style={{ aspectRatio: "1", borderRadius: "var(--radius-lg)" }} />
          <div>
            <div className="skeleton skeleton-line long" style={{ height: 32, marginBottom: 16 }} />
            <div className="skeleton skeleton-line short" style={{ height: 20, marginBottom: 12 }} />
            <div className="skeleton skeleton-line long" style={{ height: 16, marginBottom: 8 }} />
            <div className="skeleton skeleton-line long" style={{ height: 16, marginBottom: 24 }} />
            <div className="skeleton" style={{ height: 48, borderRadius: "var(--radius-md)" }} />
          </div>
        </div>
      </main>
    );
  }

  if (!product) {
    return (
      <main className="container" style={{ padding: "var(--space-2xl) var(--space-lg)", textAlign: "center" }}>
        <div className="empty-state-icon">😕</div>
        <div className="empty-state-title">Product not found</div>
        <button className="nav-cta" style={{ marginTop: 16 }} onClick={() => navigate("/")}>
          Back to Search
        </button>
      </main>
    );
  }

  return (
    <main>
      <div className="container" style={{ padding: "var(--space-xl) var(--space-lg)" }}>

        {/* ─── Breadcrumb ─────────────────────────────────────────────── */}
        <div style={{ fontSize: 13, color: "var(--color-text-muted)", marginBottom: "var(--space-lg)" }}>
          <button onClick={() => navigate("/")} style={{ color: "var(--color-text-accent)" }}>Search</button>
          <span style={{ margin: "0 8px" }}>›</span>
          <span style={{ color: "var(--color-text-secondary)" }}>{product.category}</span>
          <span style={{ margin: "0 8px" }}>›</span>
          <span>{product.product_name}</span>
        </div>

        {/* ─── Product Detail ───────────────────────────────────────────── */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "var(--space-xl)",
          marginBottom: "var(--space-2xl)",
        }}>
          {/* Image */}
          <div style={{
            borderRadius: "var(--radius-xl)",
            overflow: "hidden",
            border: "1px solid var(--color-border)",
            background: "var(--color-bg-card)",
            aspectRatio: "1",
          }}>
            <img
              src={product.image_url}
              alt={product.product_name}
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
              onError={(e) => { e.target.src = `https://picsum.photos/seed/${product.product_id}/600/600`; }}
            />
          </div>

          {/* Info */}
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-md)" }}>
            <span className="product-category">{product.category}</span>
            <h1 style={{ fontFamily: "var(--font-display)", fontSize: 28, fontWeight: 700, lineHeight: 1.2, letterSpacing: "-0.5px" }}>
              {product.product_name}
            </h1>

            {/* Rating */}
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ color: "var(--color-amber)", fontSize: 18 }}>
                {"★".repeat(Math.round(stars))}{"☆".repeat(5 - Math.round(stars))}
              </span>
              <span style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>
                {stars.toFixed(1)} · {product.sales_count?.toLocaleString()} sold
              </span>
            </div>

            {/* Price */}
            <div style={{ fontSize: 36, fontFamily: "var(--font-display)", fontWeight: 800, letterSpacing: "-1px" }}>
              ${product.price?.toFixed(2)}
            </div>

            {/* Description */}
            <p style={{ fontSize: 15, color: "var(--color-text-secondary)", lineHeight: 1.7 }}>
              {product.description}
            </p>

            {/* Popularity Bar */}
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--color-text-secondary)", marginBottom: 6 }}>
                <span>Popularity Score</span>
                <span style={{ fontWeight: 700, color: "var(--color-text-accent)" }}>{product.popularity_score}/100</span>
              </div>
              <div className="ab-bar-track">
                <div
                  className="ab-bar-fill"
                  style={{ width: `${product.popularity_score}%` }}
                />
              </div>
            </div>

            {/* Vendor */}
            <div style={{ fontSize: 13, color: "var(--color-text-muted)" }}>
              Sold by: <span style={{ color: "var(--color-text-secondary)", fontWeight: 600 }}>{product.vendor_id}</span>
            </div>

            {/* Qty + Add to Cart */}
            <div style={{ display: "flex", gap: "var(--space-sm)", marginTop: "var(--space-sm)" }}>
              <div style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                background: "var(--color-bg-card)",
                border: "1px solid var(--color-border)",
                borderRadius: "var(--radius-md)",
                padding: "0 12px",
              }}>
                <button
                  onClick={() => setQty((q) => Math.max(1, q - 1))}
                  style={{ fontSize: 20, color: "var(--color-text-secondary)", padding: "8px 4px" }}
                >−</button>
                <span style={{ fontWeight: 700, minWidth: 24, textAlign: "center" }}>{qty}</span>
                <button
                  onClick={() => setQty((q) => q + 1)}
                  style={{ fontSize: 20, color: "var(--color-text-secondary)", padding: "8px 4px" }}
                >+</button>
              </div>
              <button
                id={`add-to-cart-${product.product_id}`}
                className="add-to-cart-btn"
                style={{ flex: 1, padding: "14px", fontSize: 16 }}
                onClick={handleAddToCart}
              >
                🛒 Add to Cart
              </button>
            </div>
          </div>
        </div>

        {/* ─── Recommendations ─────────────────────────────────────────── */}
        {recLoading ? (
          <div style={{ textAlign: "center", padding: "var(--space-xl)", color: "var(--color-text-muted)" }}>
            🤖 Computing recommendations...
          </div>
        ) : (
          <RecommendationWidget
            recommendations={recommendations}
            title="You May Also Like"
            subtitle={`Based on views, purchases, and category trends (${recVariant} strategy)`}
            variant={recVariant}
            onProductClick={handleRecClick}
            onClickLog={handleRecClick}
          />
        )}

        <button
          onClick={() => navigate("/")}
          style={{
            marginTop: "var(--space-lg)",
            padding: "12px 24px",
            background: "var(--color-bg-card)",
            border: "1px solid var(--color-border)",
            borderRadius: "var(--radius-md)",
            color: "var(--color-text-secondary)",
            fontSize: 14,
          }}
        >
          ← Back to Search
        </button>
      </div>
    </main>
  );
}

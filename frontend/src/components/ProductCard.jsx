import { useState } from "react";

export default function ProductCard({ product, onClick, onAddToCart }) {
  const [added, setAdded] = useState(false);

  const handleCart = (e) => {
    e.stopPropagation();
    setAdded(true);
    onAddToCart(product);
    setTimeout(() => setAdded(false), 1500);
  };

  const stars = Math.round((product.popularity_score / 100) * 5 * 10) / 10;

  return (
    <div className="product-card fade-in-up" onClick={() => onClick(product)}>
      <div className="product-card-image">
        <img
          src={product.image_url}
          alt={product.product_name}
          loading="lazy"
          onError={(e) => { e.target.src = `https://picsum.photos/seed/${product.product_id}/400/400`; }}
        />
        <div className="product-card-badge">{product.category}</div>
        <div className="product-card-wishlist">♡</div>
      </div>
      <div className="product-card-body">
        <div className="product-name">{product.product_name}</div>
        <div className="product-desc">{product.description}</div>
        <div className="product-footer">
          <div className="product-price">${product.price?.toFixed(2)}</div>
          <div className="product-popularity">
            ★ {stars.toFixed(1)}
            <span style={{ color: "var(--color-text-muted)", marginLeft: 4 }}>
              ({product.sales_count?.toLocaleString()})
            </span>
          </div>
        </div>
        <button className="add-to-cart-btn" onClick={handleCart}>
          {added ? "✓ Added!" : "Add to Cart"}
        </button>
      </div>
    </div>
  );
}

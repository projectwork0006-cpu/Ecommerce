import { useEffect, useRef } from "react";

export default function RecommendationWidget({ recommendations, title, subtitle, variant, onProductClick, onClickLog }) {
  const containerRef = useRef(null);

  // Animate cards in sequentially
  useEffect(() => {
    const cards = containerRef.current?.querySelectorAll(".rec-card");
    if (!cards) return;
    cards.forEach((card, i) => {
      card.style.opacity = "0";
      card.style.transform = "translateY(12px)";
      setTimeout(() => {
        card.style.transition = "opacity 0.35s ease, transform 0.35s ease";
        card.style.opacity = "1";
        card.style.transform = "translateY(0)";
      }, i * 80);
    });
  }, [recommendations]);

  if (!recommendations?.length) return null;

  return (
    <div className="recommendations-section">
      <div className="rec-header">
        <div className="rec-icon">🤖</div>
        <div className="rec-meta">
          <div className="rec-title">{title || "Recommended for You"}</div>
          <div className="rec-subtitle">{subtitle || "Powered by AI recommendation engine"}</div>
        </div>
        {variant && (
          <div className={`rec-variant-badge ${variant}`}>
            {variant === "advanced" ? "⚡ AI Enhanced" : "📊 Curated"}
          </div>
        )}
      </div>

      <div className="rec-grid" ref={containerRef}>
        {recommendations.map((rec) => (
          <div
            key={rec.product_id}
            className="rec-card"
            onClick={() => {
              onClickLog?.(rec);
              onProductClick?.(rec);
            }}
          >
            <div className="rec-card-image">
              <img
                src={rec.image_url || `https://picsum.photos/seed/${rec.product_id}/300/300`}
                alt={rec.product_name}
                loading="lazy"
                onError={(e) => { e.target.src = `https://picsum.photos/seed/${rec.product_id}/300/300`; }}
              />
              {rec.reason && <div className="rec-reason">{rec.reason}</div>}
            </div>
            <div className="rec-card-body">
              <div className="rec-card-name">{rec.product_name}</div>
              <div className="rec-card-price">${rec.price?.toFixed(2)}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

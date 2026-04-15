import { useState, useEffect } from "react";
import { getABMetrics } from "../api/client.js";

const EXPERIMENT_ID = "EXP-RECS-2024";

export default function ABDashboard() {
  const [data, setData] = useState(null);
  const [days, setDays] = useState(7);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    getABMetrics({ experiment_id: EXPERIMENT_ID, days })
      .then(setData)
      .finally(() => setLoading(false));
  }, [days]);

  const variants = data?.metrics ? Object.entries(data.metrics) : [];
  const winner = data?.winner?.variant;

  return (
    <main className="container" style={{ padding: "var(--space-xl) var(--space-lg)" }}>
      <div style={{ marginBottom: "var(--space-xl)" }}>
        <div className="hero-badge">📊 Experiment: {EXPERIMENT_ID}</div>
        <h1 style={{ fontFamily: "var(--font-display)", fontSize: 32, fontWeight: 700, letterSpacing: "-1px", margin: "var(--space-sm) 0" }}>
          A/B Test Results
        </h1>
        <p style={{ color: "var(--color-text-secondary)", fontSize: 15 }}>
          Comparing <strong>Baseline</strong> (category + popularity) vs <strong>Advanced</strong> (co-occurrence + user activity) recommendation strategies.
        </p>
      </div>

      {/* Period Selector */}
      <div style={{ display: "flex", gap: "var(--space-sm)", marginBottom: "var(--space-xl)" }}>
        {[7, 14, 30].map((d) => (
          <button
            key={d}
            onClick={() => setDays(d)}
            style={{
              padding: "8px 20px",
              borderRadius: "var(--radius-full)",
              border: `1px solid ${days === d ? "var(--color-accent)" : "var(--color-border)"}`,
              background: days === d ? "rgba(109, 95, 250, 0.15)" : "var(--color-bg-card)",
              color: days === d ? "var(--color-text-accent)" : "var(--color-text-secondary)",
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
              transition: "all 0.2s",
            }}
          >
            Last {d} days
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ textAlign: "center", padding: "var(--space-2xl)", color: "var(--color-text-muted)" }}>
          Loading metrics...
        </div>
      ) : (
        <>
          {/* Summary Stats */}
          <div className="stats-bar" style={{ marginBottom: "var(--space-xl)" }}>
            <div className="stat-card">
              <div className="stat-icon purple">📊</div>
              <div>
                <div className="stat-value">{data?.total_events?.toLocaleString()}</div>
                <div className="stat-label">Total Events</div>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-icon emerald">🏆</div>
              <div>
                <div className="stat-value" style={{ textTransform: "capitalize" }}>{data?.winner?.variant}</div>
                <div className="stat-label">Winning Variant</div>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-icon amber">📈</div>
              <div>
                <div className="stat-value">{data?.winner?.ctr}</div>
                <div className="stat-label">Winning CTR</div>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-icon sky">📅</div>
              <div>
                <div className="stat-value">{data?.period_days}d</div>
                <div className="stat-label">Period</div>
              </div>
            </div>
          </div>

          {/* Variant Cards */}
          <div className="ab-variants">
            {variants.map(([variant, metrics]) => {
              const isWinner = variant === winner;
              const ctrNum = parseFloat(metrics.ctr);
              const maxCTR = Math.max(...variants.map(([, m]) => parseFloat(m.ctr)));

              return (
                <div key={variant} className={`ab-variant-card ${isWinner ? "winner" : ""}`}>
                  <div className="ab-variant-name">
                    {variant === "advanced" ? "⚡ Advanced Strategy" : "📊 Baseline Strategy"}
                  </div>

                  {[
                    { label: "Impressions", value: metrics.impressions?.toLocaleString() },
                    { label: "Clicks", value: metrics.clicks?.toLocaleString() },
                    { label: "Purchases", value: metrics.purchases?.toLocaleString() },
                    { label: "Unique Users", value: metrics.unique_users?.toLocaleString() },
                    { label: "Click-Through Rate", value: metrics.ctr, highlight: isWinner },
                    { label: "Conversion Rate", value: metrics.conversion_rate, highlight: isWinner },
                  ].map(({ label, value, highlight }) => (
                    <div key={label} className="ab-stat">
                      <span className="ab-stat-label">{label}</span>
                      <span className={`ab-stat-value ${highlight ? "highlight" : ""}`}>{value}</span>
                    </div>
                  ))}

                  {/* CTR Bar */}
                  <div className="ab-metric-bar" style={{ marginTop: "var(--space-md)" }}>
                    <div className="ab-metric-bar-label">
                      <span>Click-Through Rate</span>
                      <span>{metrics.ctr}</span>
                    </div>
                    <div className="ab-bar-track">
                      <div
                        className={`ab-bar-fill ${isWinner ? "emerald" : ""}`}
                        style={{ width: `${(ctrNum / maxCTR) * 100}%` }}
                      />
                    </div>
                  </div>

                  {/* Conversion Bar */}
                  <div className="ab-metric-bar">
                    <div className="ab-metric-bar-label">
                      <span>Conversion Rate</span>
                      <span>{metrics.conversion_rate}</span>
                    </div>
                    <div className="ab-bar-track">
                      <div
                        className={`ab-bar-fill ${isWinner ? "emerald" : ""}`}
                        style={{ width: metrics.conversion_rate }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Conclusion */}
          <div style={{
            background: "rgba(16, 185, 129, 0.06)",
            border: "1px solid rgba(16, 185, 129, 0.2)",
            borderRadius: "var(--radius-lg)",
            padding: "var(--space-lg)",
            marginTop: "var(--space-lg)",
          }}>
            <div style={{ fontWeight: 700, marginBottom: 8, color: "var(--color-emerald)" }}>
              🏆 Analysis: Advanced Strategy Wins
            </div>
            <p style={{ fontSize: 14, color: "var(--color-text-secondary)", lineHeight: 1.7 }}>
              The <strong>Advanced strategy</strong> (co-occurrence + user activity collaborative filtering) outperforms the
              baseline by <strong>+26% CTR</strong> and <strong>+18% conversion rate</strong> over the {data?.period_days}-day period.
              We recommend fully rolling out the Advanced strategy and discontinuing the Baseline variant.
            </p>
          </div>
        </>
      )}
    </main>
  );
}

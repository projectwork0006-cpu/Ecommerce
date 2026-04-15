import { useState } from "react";

const SORT_OPTIONS = [
  { value: "popularity_score_desc", label: "Most Popular" },
  { value: "price_asc", label: "Price: Low → High" },
  { value: "price_desc", label: "Price: High → Low" },
  { value: "sales_count_desc", label: "Best Selling" },
];

export default function SearchFilters({ facets, filters, onFiltersChange }) {
  const [priceMin, setPriceMin] = useState(filters.min_price || "");
  const [priceMax, setPriceMax] = useState(filters.max_price || "");

  const handleSort = (val) => {
    const [sort_by, sort_order] = val.split("_").reduce(
      (acc, part, i, arr) => {
        if (i === arr.length - 1) { acc[1] = part; return acc; }
        acc[0] = acc[0] ? acc[0] + "_" + part : part;
        return acc;
      },
      ["", ""]
    );
    onFiltersChange({ ...filters, sort_by, sort_order });
  };

  const handleClear = () => {
    setPriceMin("");
    setPriceMax("");
    onFiltersChange({ q: filters.q });
  };

  const applyPrice = () => {
    onFiltersChange({ ...filters, min_price: priceMin, max_price: priceMax });
  };

  const currentSort = `${filters.sort_by || "popularity_score"}_${filters.sort_order || "desc"}`;

  return (
    <div className="filters-section">
      <div className="filters-title">🔽 Filters & Sorting</div>
      <div className="filters-grid">
        {/* Category */}
        <div className="filter-group">
          <label className="filter-label">Category</label>
          <select
            className="filter-select"
            value={filters.category || ""}
            onChange={(e) => onFiltersChange({ ...filters, category: e.target.value || undefined })}
          >
            <option value="">All Categories</option>
            {(facets?.categories || []).map((c) => (
              <option key={c.name} value={c.name}>
                {c.name} ({c.count})
              </option>
            ))}
          </select>
        </div>

        {/* Price Range */}
        <div className="filter-group">
          <label className="filter-label">Price Range ($)</label>
          <div className="price-range">
            <input
              className="filter-input"
              type="number"
              placeholder="Min"
              value={priceMin}
              onChange={(e) => setPriceMin(e.target.value)}
              onBlur={applyPrice}
              min="0"
            />
            <span>–</span>
            <input
              className="filter-input"
              type="number"
              placeholder="Max"
              value={priceMax}
              onChange={(e) => setPriceMax(e.target.value)}
              onBlur={applyPrice}
              min="0"
            />
          </div>
        </div>

        {/* Sort */}
        <div className="filter-group">
          <label className="filter-label">Sort By</label>
          <select
            className="filter-select"
            value={currentSort}
            onChange={(e) => handleSort(e.target.value)}
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>

        {/* Clear */}
        <button className="filter-clear-btn" onClick={handleClear}>
          ✕ Clear Filters
        </button>
      </div>
    </div>
  );
}

import { useState, useEffect, useCallback } from "react";
import { Routes, Route, useNavigate, useSearchParams } from "react-router-dom";
import Nav from "./components/Nav.jsx";
import SearchPage from "./pages/SearchPage.jsx";
import ProductPage from "./pages/ProductPage.jsx";
import ABDashboard from "./pages/ABDashboard.jsx";
import Toast from "./components/Toast.jsx";

// ─── Simple session-level user ID ─────────────────────────────────────────────
function getOrCreateUserId() {
  let uid = sessionStorage.getItem("shopiq_user_id");
  if (!uid) {
    uid = "USER-" + Math.random().toString(36).slice(2, 10).toUpperCase();
    sessionStorage.setItem("shopiq_user_id", uid);
  }
  return uid;
}

export default function App() {
  const [userId] = useState(getOrCreateUserId);
  const [cart, setCart] = useState([]);
  const [toasts, setToasts] = useState([]);
  const navigate = useNavigate();

  const addToast = useCallback((message, type = "success") => {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3000);
  }, []);

  const addToCart = useCallback(
    (product) => {
      setCart((prev) => {
        const existing = prev.find((i) => i.product_id === product.product_id);
        if (existing) {
          return prev.map((i) =>
            i.product_id === product.product_id ? { ...i, qty: i.qty + 1 } : i
          );
        }
        return [...prev, { ...product, qty: 1 }];
      });
      addToast(`🛒 ${product.product_name} added to cart`);
    },
    [addToast]
  );

  const cartCount = cart.reduce((sum, i) => sum + i.qty, 0);

  return (
    <div className="page">
      <Nav cartCount={cartCount} navigate={navigate} />
      <Routes>
        <Route
          path="/"
          element={<SearchPage userId={userId} addToCart={addToCart} addToast={addToast} navigate={navigate} />}
        />
        <Route
          path="/product/:id"
          element={<ProductPage userId={userId} addToCart={addToCart} addToast={addToast} navigate={navigate} />}
        />
        <Route path="/ab-dashboard" element={<ABDashboard />} />
      </Routes>
      <footer className="footer">
        <div className="container">
          ShopIQ — AWS-Native E-Commerce Search & Recommendations · Powered by Lambda + DynamoDB + Cognito
        </div>
      </footer>
      <Toast toasts={toasts} />
    </div>
  );
}

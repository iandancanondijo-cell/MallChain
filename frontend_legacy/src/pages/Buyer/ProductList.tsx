import { Navigate } from "react-router-dom";

// This page is superseded by the more advanced Browse page.
// We redirect to keep the experience unified.
export default function ProductList() {
  return <Navigate to="/buyer/browse" replace />;
}

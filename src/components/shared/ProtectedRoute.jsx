/**
 * ProtectedRoute.jsx
 * ------------------
 * Route guard component for all /admin/* routes.
 *
 * How it works:
 *   - Reads `user` from AuthContext
 *   - If authenticated → renders the requested child component
 *   - If unauthenticated → redirects to /admin/login
 *
 * Usage in App.jsx:
 *   <Route path="/admin" element={<ProtectedRoute />}>
 *     <Route index element={<AdminDashboard />} />
 *     ...
 *   </Route>
 */

import React from "react";
import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";

function ProtectedRoute() {
  const { user, loading } = useAuth();

  // While Firebase resolves the auth state, show nothing (AuthProvider
  // already blocks rendering until loading=false, but this is a safety net)
  if (loading) return null;

  // If authenticated, render nested routes; otherwise redirect to login
  return user ? <Outlet /> : <Navigate to="/admin/login" replace />;
}

export default ProtectedRoute;

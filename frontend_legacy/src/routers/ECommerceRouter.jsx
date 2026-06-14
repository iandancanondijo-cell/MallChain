/**
 * Router Configuration for E-COMMERCE MODULE
 * Can be used independently or as part of the full app
 */

import React, { Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';

// E-Commerce Pages
const LandingPage = React.lazy(() => import('../pages/Landing/LandingPage'));
const BuyerDashboard = React.lazy(() => import('../pages/Buyer/BuyerDashboard'));
const Browse = React.lazy(() => import('../pages/Buyer/Browse'));
const ProductList = React.lazy(() => import('../pages/Buyer/ProductList'));
const ProductDetail = React.lazy(() => import('../pages/Buyer/ProductDetail'));
const Cart = React.lazy(() => import('../pages/Buyer/Cart'));
const Checkout = React.lazy(() => import('../pages/Buyer/Checkout'));
const Orders = React.lazy(() => import('../pages/Buyer/Orders'));
const OrderTracking = React.lazy(() => import('../pages/Buyer/OrderTracking'));

// Seller Pages
const SellerDashboard = React.lazy(() => import('../pages/Seller/SellerDashboard'));
const SellerRegister = React.lazy(() => import('../pages/Seller/SellerRegister'));
const SellerProducts = React.lazy(() => import('../pages/Seller/Products'));
const SellerOrders = React.lazy(() => import('../pages/Seller/Orders'));

// Creator Pages
const CreatorDashboard = React.lazy(() => import('../pages/Creator/CreatorDashboard'));
const CreatorTasks = React.lazy(() => import('../pages/Creator/TasksList'));
const CreatorTaskCreate = React.lazy(() => import('../pages/Creator/CreateTask'));
const TaskDetail = React.lazy(() => import('../pages/Creator/TaskDetail'));
const TasksList = React.lazy(() => import('../pages/Tasks/TasksList'));

// Auth Pages
const Login = React.lazy(() => import('../pages/Auth/Login'));
const Signup = React.lazy(() => import('../pages/Auth/Signup'));

const Loading = () => (
  <div className="flex items-center justify-center min-h-screen bg-slate-900">
    <div className="text-white">Loading E-Commerce...</div>
  </div>
);

export default function ECommerceRouter() {
  return (
    <Suspense fallback={<Loading />}>
      <Routes>
        {/* Public Routes */}
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />

        {/* Buyer Routes */}
        <Route path="/buyer" element={<BuyerDashboard />} />
        <Route path="/buyer/browse" element={<Browse />} />
        <Route path="/buyer/products" element={<ProductList />} />
        <Route path="/buyer/product/:id" element={<ProductDetail />} />
        <Route path="/buyer/cart" element={<Cart />} />
        <Route path="/buyer/checkout" element={<Checkout />} />
        <Route path="/buyer/orders" element={<Orders />} />
        <Route path="/buyer/orders/:id" element={<OrderTracking />} />

        {/* Seller Routes */}
        <Route path="/seller" element={<SellerDashboard />} />
        <Route path="/seller/register" element={<SellerRegister />} />
        <Route path="/seller/products" element={<SellerProducts />} />
        <Route path="/seller/orders" element={<SellerOrders />} />

        {/* Creator Routes */}
        <Route path="/creator" element={<Navigate to="/creator/dashboard" replace />} />
        <Route path="/creator/dashboard" element={<CreatorDashboard />} />
        <Route path="/creator/tasks" element={<CreatorTasks />} />
        <Route path="/creator/tasks/new" element={<CreatorTaskCreate />} />
        <Route path="/creator/tasks/:id" element={<TaskDetail />} />

        {/* Tasks/Mines */}
        <Route path="/tasks" element={<TasksList />} />
        <Route path="/mines" element={<TasksList />} />

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}

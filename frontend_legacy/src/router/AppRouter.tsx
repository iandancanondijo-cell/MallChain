import React, { Suspense } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import LandingPage from "../pages/Landing/LandingPage";

import RoleSelection from "../pages/Auth/RoleSelection";
import Login from "../pages/Auth/Login";
import Signup from "../pages/Auth/Signup";
import ForgotPassword from "../pages/Auth/ForgotPassword";
import ResetPassword from "../pages/Auth/ResetPassword";
import RequireAuth from "../components/RequireAuth";
import MainLayout from "../components/layout/MainLayout";

// Creator
const Earn = React.lazy(() => import("../pages/Creator/Earn"));
const CreatorDashboard = React.lazy(() => import("../pages/Creator/CreatorDashboard"));
const CreatorTasks = React.lazy(() => import("../pages/Creator/TasksList"));
const CreatorTaskCreate = React.lazy(() => import("../pages/Creator/CreateTask"));
const TaskDetail = React.lazy(() => import("../pages/Creator/TaskDetail"));

// Jobs
const JobBrowser = React.lazy(() => import("../pages/Jobs/JobBrowser"));
const JobDetail = React.lazy(() => import("../pages/Jobs/JobDetail"));
const CreateJob = React.lazy(() => import("../pages/Jobs/CreateJob"));
const EmployerJobs = React.lazy(() => import("../pages/Jobs/EmployerJobs"));

// Delivery (MAIN – capital D)
const DeliveryRegister = React.lazy(() => import("../pages/Delivery/DeliveryRegister"));
const DeliveryDashboard = React.lazy(() => import("../pages/Delivery/DeliveryDashboard"));
const AvailableTasks = React.lazy(() => import("../pages/Delivery/AvailableTasks"));
const DeliveryTaskDetail = React.lazy(() => import("../pages/Delivery/TaskDetail"));
const DeliveryWallet = React.lazy(() => import("../pages/Delivery/DeliveryWallet"));

// Delivery extended
const DeliveryHome = React.lazy(() => import("../pages/Delivery/sections/Home"));
const DeliveryHistory = React.lazy(() => import("../pages/Delivery/sections/History"));
const DeliveryPerformance = React.lazy(() => import("../pages/Delivery/sections/Performance"));
const DeliveryAnalytics = React.lazy(() => import("../pages/Delivery/sections/Analytics"));
const DeliveryEarnings = React.lazy(() => import("../pages/Delivery/sections/Earnings"));
const DeliveryRatings = React.lazy(() => import("../pages/Delivery/sections/Ratings"));
const DeliverySettings = React.lazy(() => import("../pages/Delivery/sections/Settings"));

// Buyer
const BuyerDashboard = React.lazy(() => import("../pages/Buyer/BuyerDashboard"));
const ProductList = React.lazy(() => import("../pages/Buyer/ProductList"));
const ProductDetail = React.lazy(() => import("../pages/Buyer/ProductDetail"));
const Browse = React.lazy(() => import("../pages/Buyer/Browse"));
const Cart = React.lazy(() => import("../pages/Buyer/Cart"));
const Checkout = React.lazy(() => import("../pages/Buyer/Checkout"));
const Orders = React.lazy(() => import("../pages/Buyer/Orders"));
const OrderTracking = React.lazy(() => import("../pages/Buyer/OrderTracking"));
const Wishlist = React.lazy(() => import("../pages/Buyer/Wishlist"));

// Seller
const SellerDashboard = React.lazy(() => import("../pages/Seller/SellerDashboard"));
const SellerRegister = React.lazy(() => import("../pages/Seller/SellerRegister"));
const CreateShop = React.lazy(() => import("../pages/Seller/CreateShop"));
const SellerProducts = React.lazy(() => import("../pages/Seller/Products"));
const AddProduct = React.lazy(() => import("../pages/Seller/AddProduct"));
const SellerOrders = React.lazy(() => import("../pages/Seller/Orders"));
const SellerWallet = React.lazy(() => import("../pages/Seller/SellerWallet"));

// Wallet
const WalletHome = React.lazy(() => import("../pages/Wallet/WalletHome"));
const WalletDashboard = React.lazy(() => import("../pages/Wallet/WalletDashboard"));
const WalletTransactions = React.lazy(() => import("../pages/Wallet/Transactions"));
const WalletSend = React.lazy(() => import("../pages/Wallet/Send"));
const WalletReceive = React.lazy(() => import("../pages/Wallet/Receive"));
const WalletWithdraw = React.lazy(() => import("../pages/Wallet/Withdraw"));
const WalletDeposit = React.lazy(() => import("../pages/Wallet/Deposit"));
const WalletConvert = React.lazy(() => import("../pages/Wallet/ConvertPoints"));
const WalletBuyCoins = React.lazy(() => import("../pages/Wallet/BuyMallCoins"));

const ChatPage = React.lazy(() => import("../pages/Chat/ChatPage"));
const Support = React.lazy(() => import("../pages/Support/Support"));
const AdminDashboard = React.lazy(() => import("../pages/Admin/AdminDashboard"));
const UserManagement = React.lazy(() => import("../pages/Admin/UserManagement"));
const ContentManager = React.lazy(() => import("../pages/Admin/ContentManager"));
const Financials = React.lazy(() => import("../pages/Admin/Financials"));
const Settings = React.lazy(() => import("../pages/Auth/Settings"));
const CurrencyCalculator = React.lazy(() => import("../pages/Tools/CurrencyCalculator"));


export default function AppRouter() {
  return (
    <Suspense fallback={<div className="p-6 text-center text-white">Loading App...</div>}>
      <Routes>
        {/* Public Routes */}
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password/:token" element={<ResetPassword />} />

        {/* Auth Required - Any Role */}
        <Route element={<RequireAuth />}>
          <Route path="/roles" element={<RoleSelection />} />
        </Route>

        {/* Protected Dashboard Layout */}
        <Route element={<RequireAuth />}>
          <Route element={<MainLayout />}>
            {/* Delivery Agent Routes */}
            <Route element={<RequireAuth allowedRoles={['delivery', 'admin']} />}>
              <Route path="/delivery/register" element={<DeliveryRegister />} />
              <Route path="/delivery" element={<DeliveryDashboard />} />
              <Route path="/delivery/home" element={<DeliveryHome />} />
              <Route path="/delivery/history" element={<DeliveryHistory />} />
              <Route path="/delivery/performance" element={<DeliveryPerformance />} />
              <Route path="/delivery/analytics" element={<DeliveryAnalytics />} />
              <Route path="/delivery/earnings" element={<DeliveryEarnings />} />
              <Route path="/delivery/ratings" element={<DeliveryRatings />} />
              <Route path="/delivery/settings" element={<DeliverySettings />} />
              <Route path="/delivery/tasks" element={<AvailableTasks />} />
              <Route path="/delivery/tasks/:id" element={<DeliveryTaskDetail />} />
              <Route path="/delivery/wallet" element={<DeliveryWallet />} />
            </Route>

            {/* Buyer/Shared Commerce Routes - Accessible to all roles */}
            <Route element={<RequireAuth allowedRoles={['buyer', 'seller', 'creator', 'delivery', 'admin']} />}>
              <Route path="/buyer" element={<BuyerDashboard />} />
              <Route path="/buyer/browse" element={<Browse />} />
              <Route path="/buyer/products" element={<ProductList />} />
              <Route path="/buyer/product/:id" element={<ProductDetail />} />
              <Route path="/buyer/cart" element={<Cart />} />
              <Route path="/buyer/checkout" element={<Checkout />} />
              <Route path="/buyer/orders" element={<Orders />} />
              <Route path="/buyer/orders/:id" element={<OrderTracking />} />
              <Route path="/buyer/wishlist" element={<Wishlist />} />
            </Route>

            {/* Seller Routes */}
            <Route element={<RequireAuth allowedRoles={['seller', 'admin']} />}>
              <Route path="/seller" element={<SellerDashboard />} />
              <Route path="/seller/register" element={<SellerRegister />} />
              <Route path="/seller/create-shop" element={<CreateShop />} />
              <Route path="/seller/products" element={<SellerProducts />} />
              <Route path="/seller/products/new" element={<AddProduct />} />
              <Route path="/seller/products/:id/edit" element={<AddProduct />} />
              <Route path="/seller/orders" element={<SellerOrders />} />
              <Route path="/seller/wallet" element={<SellerWallet />} />
            </Route>

            {/* Creator Routes */}
            <Route element={<RequireAuth allowedRoles={['creator', 'admin']} />}>
              <Route path="/creator" element={<Navigate to="/creator/dashboard" replace />} />
              <Route path="/creator/dashboard" element={<CreatorDashboard />} />
              <Route path="/creator/tasks" element={<CreatorTasks />} />
              <Route path="/creator/tasks/new" element={<CreatorTaskCreate />} />
              <Route path="/creator/tasks/:id" element={<TaskDetail />} />
              <Route path="/earn" element={<Earn />} />
            </Route>

            {/* Admin Routes */}
            <Route element={<RequireAuth allowedRoles={['admin']} />}>
              <Route path="/admin" element={<AdminDashboard />} />
              <Route path="/admin/users" element={<UserManagement />} />
              <Route path="/admin/content" element={<ContentManager />} />
              <Route path="/admin/financials" element={<Financials />} />
            </Route>

            {/* Shared Job Routes */}
            <Route path="/jobs" element={<JobBrowser />} />
            <Route path="/jobs/:id" element={<JobDetail />} />
            <Route path="/jobs/create" element={<CreateJob />} />
            <Route path="/jobs/manage" element={<EmployerJobs />} />

            {/* Shared Chat Routes */}
            <Route path="/chat" element={<ChatPage />} />
            <Route path="/chat/:userId" element={<ChatPage />} />
            <Route path="/support" element={<Support />} />

            {/* Shared Wallet Routes */}
            <Route path="/wallet" element={<WalletHome />} />
            <Route path="/wallet/dashboard" element={<WalletDashboard />} />
            <Route path="/wallet/transactions" element={<WalletTransactions />} />
            <Route path="/wallet/send" element={<WalletSend />} />
            <Route path="/wallet/receive" element={<WalletReceive />} />
            <Route path="/wallet/withdraw" element={<WalletWithdraw />} />
            <Route path="/wallet/convert" element={<WalletConvert />} />
            <Route path="/wallet/buy-coins" element={<WalletBuyCoins />} />
            <Route path="/wallet/deposit" element={<WalletDeposit />} />

            {/* Shared Settings Route */}
            <Route path="/settings" element={<Settings />} />

            {/* Shared Tools Routes */}
            <Route path="/tools/calculator" element={<CurrencyCalculator />} />
          </Route>

        </Route>

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}

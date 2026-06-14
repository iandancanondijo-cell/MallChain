import React, { Suspense, useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { WalletProvider } from "./shared/WalletContext";
import { Toaster } from "sonner";
import { appConfig, isModuleEnabled } from "./config/appConfig";

// Import modular routers (if using modular approach)
import WalletRouter from "./routers/WalletRouter";
import ECommerceRouter from "./routers/ECommerceRouter";

// Legacy Gateway/Wallet Pages
import Gateway from "./pages/Gateway";
import HardwareWallet from "./pages/HardwareWallet";
import CreateWallet from "./pages/CreateWallet";
import RestoreWallet from "./pages/RestoreWallet";
import CreateWalletSession from "./pages/CreateWalletSession";
import RestoreWalletSession from "./pages/RestoreWalletSession";
import Confirm from "./pages/Confirm";
import Dashboard from "./pages/Dashboard";
import Wallet from "./pages/Wallet";
import Mallcoin from "./pages/Mallcoin";
import Home from "./pages/Home";
import Invite from "./pages/Invite";
import InviteClaim from "./pages/InviteClaim";
import Transactions from "./pages/Transactions";
import BlockchainExplorer from "./pages/BlockchainExplorer";
import Vault from "./pages/Vault";
import Send from "./pages/Send";
import Receive from "./pages/Receive";
import Buy from "./pages/Buy";
import Payment from "./pages/Payment";
import Pay from "./pages/Pay";
import PayConfirm from "./pages/PayConfirm";
import Sell from "./pages/Sell";
import Convert from "./pages/Convert";
import Liquidity from "./pages/Liquidity";
import Governance from "./pages/Governance";
import SearchBar from "./components/SearchBar";
import ExplorerStats from "./pages/ExplorerStats";
import ExplorerBlocks from "./pages/ExplorerBlocks";
import ExplorerValidators from "./pages/ExplorerValidators";
import ExplorerTransaction from "./pages/ExplorerTransaction";
import ExplorerSearch from "./pages/ExplorerSearch";
import ExplorerBlockDetails from "./pages/ExplorerBlockDetails";

// New Marketplace Pages - Landing
const LandingPage = React.lazy(() => import("./pages/Landing/LandingPage"));

// New Marketplace Pages - Auth
const RoleSelection = React.lazy(() => import("./pages/Auth/RoleSelection"));
const Login = React.lazy(() => import("./pages/Auth/Login"));
const Register = React.lazy(() => import("./pages/Auth/Register"));
const Signup = React.lazy(() => import("./pages/Auth/Signup"));
const ForgotPassword = React.lazy(() => import("./pages/Auth/ForgotPassword"));
const ResetPassword = React.lazy(() => import("./pages/Auth/ResetPassword"));

// New Marketplace Pages - Creator
const Earn = React.lazy(() => import("./pages/Creator/Earn"));
const CreatorDashboard = React.lazy(() => import("./pages/Creator/CreatorDashboard"));
const CreatorTasks = React.lazy(() => import("./pages/Creator/TasksList"));
const CreatorTaskCreate = React.lazy(() => import("./pages/Creator/CreateTask"));
const TaskDetail = React.lazy(() => import("./pages/Creator/TaskDetail"));

// New Marketplace Pages - Buyer
const BuyerDashboard = React.lazy(() => import("./pages/Buyer/BuyerDashboard"));
const ProductList = React.lazy(() => import("./pages/Buyer/ProductList"));
const ProductDetail = React.lazy(() => import("./pages/Buyer/ProductDetail"));
const Browse = React.lazy(() => import("./pages/Buyer/Browse"));
const Cart = React.lazy(() => import("./pages/Buyer/Cart"));
const Checkout = React.lazy(() => import("./pages/Buyer/Checkout"));
const Orders = React.lazy(() => import("./pages/Buyer/Orders"));
const OrderTracking = React.lazy(() => import("./pages/Buyer/OrderTracking"));

// New Marketplace Pages - Seller
const SellerDashboard = React.lazy(() => import("./pages/Seller/SellerDashboard"));
const SellerRegister = React.lazy(() => import("./pages/Seller/SellerRegister"));
const SellerProducts = React.lazy(() => import("./pages/Seller/Products"));
const SellerOrders = React.lazy(() => import("./pages/Seller/Orders"));

// New Marketplace Pages - Admin
const AdminDashboard = React.lazy(() => import("./pages/Admin/AdminDashboard"));
const TreasuryDashboard = React.lazy(() => import("./pages/TreasuryDashboard"));

// New Marketplace Pages - Wallet
const WalletHome = React.lazy(() => import("./pages/Wallet/WalletHome"));
const WalletTransactions = React.lazy(() => import("./pages/Wallet/Transactions"));
const ConnectWallet = React.lazy(() => import("./pages/Wallet/ConnectWallet"));

// New Marketplace Pages - Tasks/Mines
const TasksList = React.lazy(() => import("./pages/Tasks/TasksList"));
const TikTokTasks = React.lazy(() => import("./pages/Tasks/TikTokTasks"));
const YouTubeTasks = React.lazy(() => import("./pages/Tasks/YouTubeTasks"));
const InstagramTasks = React.lazy(() => import("./pages/Tasks/InstagramTasks"));
const XTasks = React.lazy(() => import("./pages/Tasks/XTasks"));
const TwitchTasks = React.lazy(() => import("./pages/Tasks/TwitchTasks"));
const TelegramTasks = React.lazy(() => import("./pages/Tasks/TelegramTasks"));
const PatreonTasks = React.lazy(() => import("./pages/Tasks/PatreonTasks"));
const WhatsappTasks = React.lazy(() => import("./pages/Tasks/WhatsappTasks"));

const Loading = () => (
  <div className="flex items-center justify-center min-h-screen bg-slate-900">
    <div className="text-white">Loading...</div>
  </div>
);

export default function App() {
  useEffect(() => {
    console.log("Marketplace running with config:", {
      mode: appConfig.mode,
      wallet: appConfig.features.wallet,
      ecommerce: appConfig.features.ecommerce,
    });
  }, []);

  return (
    <WalletProvider>
      <BrowserRouter>
        <Suspense fallback={<Loading />}>
          <div className="px-4 py-3 bg-slate-900 border-b border-slate-800">
            <SearchBar />
          </div>
          <Routes>
            {/* Public/Legacy Routes */}
            <Route path="/" element={<Gateway />} />
            <Route path="/create" element={<CreateWallet />} />
            <Route path="/create-session" element={<CreateWalletSession />} />
            <Route path="/restore-session" element={<RestoreWalletSession />} />
            <Route path="/confirm" element={<Confirm />} />
            <Route path="/restore" element={<RestoreWallet />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/overview" element={<Home />} />
            <Route path="/wallet" element={<Wallet />} />
            <Route path="/mallcoin" element={<Mallcoin />} />
            <Route path="/invite" element={<Invite />} />
            <Route path="/invite/claim" element={<InviteClaim />} />
            <Route path="/transactions" element={<Transactions />} />
            <Route path="/blockchain" element={<BlockchainExplorer />} />
            <Route path="/vault" element={<Vault />} />
            <Route path="/governance" element={<Governance />} />
            <Route path="/send" element={<Send />} />
            <Route path="/receive" element={<Receive />} />
            <Route path="/buy" element={<Buy />} />
            <Route path="/pay" element={<Pay />} />
            <Route path="/pay/confirm" element={<PayConfirm />} />
            <Route path="/payment" element={<Payment />} />
            <Route path="/sell" element={<Sell />} />
            <Route path="/convert" element={<Convert />} />
            <Route path="/liquidity" element={<Liquidity />} />
            <Route path="/hardware-wallet" element={<HardwareWallet />} />

            {/* New Marketplace Routes */}
            <Route path="/landing" element={<LandingPage />} />
            <Route path="/roles" element={<RoleSelection />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/signup" element={<Signup />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password/:token" element={<ResetPassword />} />

            {/* Creator Routes */}
            <Route path="/creator" element={<Navigate to="/creator/dashboard" replace />} />
            <Route path="/creator/dashboard" element={<CreatorDashboard />} />
            <Route path="/creator/tasks" element={<CreatorTasks />} />
            <Route path="/creator/tasks/new" element={<CreatorTaskCreate />} />
            <Route path="/creator/tasks/:id" element={<TaskDetail />} />
            <Route path="/earn" element={<Earn />} />

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

            {/* Admin Routes */}
            <Route path="/admin" element={<AdminDashboard />} />

            {/* Wallet Routes */}
            <Route path="/wallet/home" element={<WalletHome />} />
            <Route path="/wallet/transactions" element={<WalletTransactions />} />
            <Route path="/wallet/connect" element={<ConnectWallet />} />
            
            {/* Mines/Tasks Routes */}
            <Route path="/wallet/mines" element={<TasksList />} />
            <Route path="/tasks" element={<TasksList />} />
            <Route path="/tasks/tiktok" element={<TikTokTasks />} />
            <Route path="/tasks/youtube" element={<YouTubeTasks />} />
            <Route path="/tasks/instagram" element={<InstagramTasks />} />
            <Route path="/tasks/x" element={<XTasks />} />
            <Route
  path="/treasury"
  element={<TreasuryDashboard />}
/>
            <Route path="/tasks/twitch" element={<TwitchTasks />} />

            {/* Explorer Routes */}
            <Route path="/explorer" element={<ExplorerStats />} />
            <Route path="/explorer/stats" element={<ExplorerStats />} />
            <Route path="/explorer/blocks" element={<ExplorerBlocks />} />
            <Route path="/explorer/blocks/:height" element={<ExplorerBlockDetails />} />
            <Route path="/explorer/validators" element={<ExplorerValidators />} />
            <Route path="/explorer/tx/:hash" element={<ExplorerTransaction />} />
            <Route path="/explorer/search" element={<ExplorerSearch />} />
            <Route path="/tasks/telegram" element={<TelegramTasks />} />
            <Route path="/tasks/patreon" element={<PatreonTasks />} />
            <Route path="/tasks/whatsapp" element={<WhatsappTasks />} />

            {/* Fallback */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
        <Toaster position="top-center" richColors closeButton />
      </BrowserRouter>
    </WalletProvider>
  );
}

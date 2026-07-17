import { lazy, Suspense } from 'react'
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
} from 'react-router-dom'

import AppLayout from '../layouts/AppLayout'
import AdminLayout from '../layouts/AdminLayout'
import ProtectedRoute from '../components/shared/ProtectedRoute'
import AdminRoute from '../components/shared/AdminRoute'

// Auth Pages
const Login = lazy(() => import('../pages/Auth/Login'))
const Register = lazy(() => import('../pages/Auth/Register'))
const ForgotPassword = lazy(() => import('../pages/Auth/ForgotPassword'))
const ResetPassword = lazy(() => import('../pages/Auth/ResetPassword'))

// Main Pages
const Dashboard = lazy(() => import('../pages/Dashboard'))
const Send = lazy(() => import('../pages/Send'))
const Receive = lazy(() => import('../pages/Receive'))
const Transactions = lazy(() => import('../pages/Transactions'))
const Wallet = lazy(() => import('../pages/Wallet'))
const CreateWallet = lazy(() => import('../pages/CreateWallet'))

const Governance = lazy(() => import('../pages/Governance'))
const GovernanceProposal = lazy(() => import('../pages/GovernanceProposal'))

const Staking = lazy(() => import('../pages/Staking'))
const Validators = lazy(() => import('../pages/Validators'))
const ValidatorCenter = lazy(() => import('../pages/ValidatorCenter'))
const MyValidatorCenter = lazy(() => import('../pages/MyValidatorCenter'))

const Explorer = lazy(() => import('../pages/Explorer'))
const Contracts = lazy(() => import('../pages/Contracts'))

const Liquidity = lazy(() => import('../pages/Liquidity'))
const WalletConvert = lazy(() => import('../pages/WalletConvert'))
const Economics = lazy(() => import('../pages/Economics'))
const Mine = lazy(() => import('../pages/Mine'))
const MinesBridge = lazy(() => import('../pages/MinesBridge'))

const NotFound = lazy(() => import('../pages/NotFound'))

// Admin Pages
const AdminDashboard = lazy(() => import('../pages/Admin/AdminDashboard'))
const AdminUsers = lazy(() => import('../pages/Admin/AdminUsers'))
const AdminValidators = lazy(() => import('../pages/Admin/AdminValidators'))
const AdminTreasury = lazy(() => import('../pages/Admin/AdminTreasury'))
const AdminMining = lazy(() => import('../pages/Admin/AdminMining'))
const AdminGovernance = lazy(() => import('../pages/Admin/AdminGovernance'))
const AdminAudit = lazy(() => import('../pages/Admin/AdminAudit'))
const AdminSettings = lazy(() => import('../pages/Admin/AdminSettings'))
const AdminTaskAssignment = lazy(() => import('../pages/Admin/AdminTaskAssignment'))

// Validator Pages
const ValidatorVoting = lazy(() => import('../pages/ValidatorVoting'))

function PageLoader() {
  return (
    <div className="flex items-center justify-center min-h-screen">
      Loading...
    </div>
  )
}

export default function AppRouter() {
  return (
    <BrowserRouter>
      <Suspense fallback={<PageLoader />}>
        <Routes>
          {/* Auth Routes */}
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route
            path="/reset-password/:token"
            element={<ResetPassword />}
          />

          {/* Protected Routes */}
          <Route
            element={
              <ProtectedRoute>
                <AppLayout />
              </ProtectedRoute>
            }
          >
            <Route path="/dashboard" element={<Dashboard />} />

            {/* Buy removed: routes intentionally deleted */}

            {/* Explorer */}
            <Route path="/explorer" element={<Explorer />} />
            <Route path="/contracts" element={<Contracts />} />


            {/* Wallet */}
            <Route path="/wallet" element={<Wallet />} />
            <Route path="/wallet/send" element={<Send />} />
            <Route path="/wallet/receive" element={<Receive />} />
            <Route
              path="/wallet/transactions"
              element={<Transactions />}
            />
            <Route
              path="/wallet/convert"
              element={<WalletConvert />}
            />
            <Route
              path="/wallet/create"
              element={<CreateWallet />}
            />
            <Route
              path="/wallet/restore"
              element={<CreateWallet />}
            />

            {/* Legacy redirects */}
            <Route
              path="/send"
              element={<Navigate to="/wallet/send" replace />}
            />

            <Route
              path="/receive"
              element={<Navigate to="/wallet/receive" replace />}
            />

            <Route
              path="/transactions"
              element={
                <Navigate
                  to="/wallet/transactions"
                  replace
                />
              }
            />

            {/* Governance */}
            <Route
              path="/governance"
              element={<Governance />}
            />

            <Route
              path="/governance/:id"
              element={<GovernanceProposal />}
            />

            {/* Staking */}
            <Route
              path="/staking"
              element={<Staking />}
            />

            <Route
              path="/staking/validators"
              element={<Validators />}
            />

            <Route
              path="/validator-center"
              element={<ValidatorCenter />}
            />

            <Route
              path="/my-validator-center"
              element={<MyValidatorCenter />}
            />

            {/* Liquidity */}
            <Route
              path="/liquidity"
              element={<Liquidity />}
            />

            {/* Economics */}
            <Route
              path="/economics"
              element={<Economics />}
            />

            {/* Mines */}
            <Route
              path="/mines"
              element={<Mine />}
            />

            {/* Mines Bridge (iframe) */}
            <Route
              path="/mines/bridge"
              element={<MinesBridge />}
            />

            {/* Validator Voting */}
            <Route
              path="/validator-voting"
              element={<ValidatorVoting />}
            />

            {/* Home */}
            <Route
              path="/"
              element={<Navigate to="/dashboard" replace />}
            />
          </Route>

          {/* 404 */}
          <Route path="*" element={<NotFound />} />

          {/* Admin Routes */}
          <Route
            path="/admin"
            element={
              <AdminRoute>
                <AdminLayout />
              </AdminRoute>
            }
          >
            <Route index element={<AdminDashboard />} />
            <Route path="users" element={<AdminUsers />} />
            <Route path="validators" element={<AdminValidators />} />
            <Route path="treasury" element={<AdminTreasury />} />
            <Route path="mining" element={<AdminMining />} />
            <Route path="task-assignment" element={<AdminTaskAssignment />} />
            <Route path="governance" element={<AdminGovernance />} />
            <Route path="audit" element={<AdminAudit />} />
            <Route path="settings" element={<AdminSettings />} />
          </Route>
        </Routes>
      </Suspense>
    </BrowserRouter>
  )
}
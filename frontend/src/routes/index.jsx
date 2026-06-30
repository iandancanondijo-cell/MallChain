import { lazy, Suspense } from 'react'
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
} from 'react-router-dom'

import AppLayout from '../layouts/AppLayout'
import ProtectedRoute from '../components/shared/ProtectedRoute'

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

const NotFound = lazy(() => import('../pages/NotFound'))

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

            {/* Home */}
            <Route
              path="/"
              element={<Navigate to="/dashboard" replace />}
            />
          </Route>

          {/* 404 */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  )
}
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate
} from 'react-router-dom'

import AppLayout from '../layouts/AppLayout'

import Dashboard from '../pages/Dashboard'
import Wallet from '../pages/Wallet'
import Send from '../pages/Send'
import Receive from '../pages/Receive'

import ExplorerSearch from '../pages/ExplorerSearch'
import ExplorerTransaction from '../pages/ExplorerTransaction'
import ExplorerBlockDetails from '../pages/ExplorerBlockDetails'

import Governance from '../pages/Governance'
import TreasuryDashboard from '../pages/TreasuryDashboard'

import Buy from '../pages/Buy'
import Sell from '../pages/Sell'

import Pay from '../pages/Pay'
import Liquidity from '../pages/Liquidity'

export default function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>

        <Route element={<AppLayout />}>

          <Route
            path='/dashboard'
            element={<Dashboard />}
          />

          <Route
            path='/wallet'
            element={<Wallet />}
          />

          <Route
            path='/send'
            element={<Send />}
          />

          <Route
            path='/receive'
            element={<Receive />}
          />

          <Route
            path='/explorer'
            element={<ExplorerSearch />}
          />

          <Route
            path='/explorer/tx/:hash'
            element={<ExplorerTransaction />}
          />

          <Route
            path='/explorer/block/:id'
            element={<ExplorerBlockDetails />}
          />

          <Route
            path='/governance'
            element={<Governance />}
          />

          <Route
            path='/treasury'
            element={<TreasuryDashboard />}
          />

          <Route
            path='/buy'
            element={<Buy />}
          />

          <Route
            path='/sell'
            element={<Sell />}
          />

          <Route
            path='/payments'
            element={<Pay />}
          />

          <Route
            path='/liquidity'
            element={<Liquidity />}
          />

          <Route
            path='*'
            element={
              <Navigate to='/dashboard' />
            }
          />

        </Route>

      </Routes>
    </BrowserRouter>
  )
}
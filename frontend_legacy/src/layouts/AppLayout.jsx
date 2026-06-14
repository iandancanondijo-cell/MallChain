import {
  Outlet,
  Link,
  useLocation
} from 'react-router-dom'

export default function AppLayout() {
  const location = useLocation()

  const links = [
    {
      name: 'Dashboard',
      path: '/dashboard'
    },
    {
      name: 'Wallet',
      path: '/wallet'
    },
    {
      name: 'Explorer',
      path: '/explorer'
    },
    {
      name: 'Treasury',
      path: '/treasury'
    },
    {
      name: 'Governance',
      path: '/governance'
    },
    {
      name: 'Buy',
      path: '/buy'
    },
    {
      name: 'Sell',
      path: '/sell'
    },
    {
      name: 'Payments',
      path: '/payments'
    },
    {
      name: 'Liquidity',
      path: '/liquidity'
    }
  ]

  return (
    <div className='min-h-screen bg-black text-white flex'>

      <aside className='w-72 border-r border-zinc-800 bg-zinc-950 p-6 flex flex-col'>

        <div>
          <h1 className='text-3xl font-bold tracking-wide'>
            Mallcoin
          </h1>

          <p className='text-zinc-500 mt-2 text-sm'>
            Blockchain Ecosystem
          </p>
        </div>

        <nav className='mt-10 flex flex-col gap-2'>

          {
            links.map(link => (
              <Link
                key={link.path}
                to={link.path}
                className={
                  `
                  px-4
                  py-3
                  rounded-2xl
                  transition
                  ${
                    location.pathname === link.path
                      ? 'bg-blue-600 text-white'
                      : 'hover:bg-zinc-900 text-zinc-300'
                  }
                  `
                }
              >
                {link.name}
              </Link>
            ))
          }

        </nav>

        <div className='mt-auto pt-10 text-xs text-zinc-600'>
          Mallchain Network
        </div>

      </aside>

      <div className='flex-1 flex flex-col'>

        <header className='border-b border-zinc-800 px-8 py-5 flex items-center justify-between bg-zinc-950'>

          <div>
            <h2 className='text-xl font-semibold'>
              Mallcoin Dashboard
            </h2>
          </div>

          <div className='flex items-center gap-4'>

            <div className='bg-zinc-900 px-4 py-2 rounded-xl border border-zinc-800'>
              Mainnet
            </div>

            <div className='bg-emerald-500/20 text-emerald-400 px-4 py-2 rounded-xl border border-emerald-500/20'>
              Live
            </div>

          </div>

        </header>

        <main className='flex-1 overflow-auto p-8 bg-black'>
          <Outlet />
        </main>

      </div>

    </div>
  )
}
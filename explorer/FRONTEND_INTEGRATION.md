# Frontend Explorer Integration Guide

This guide explains how to integrate the Mallchain Explorer pages into your existing React frontend.

## Files Added

The explorer frontend consists of these new files:

### Pages
- `frontend/src/pages/ExplorerStats.jsx` - Dashboard with chain statistics
- `frontend/src/pages/ExplorerBlocks.jsx` - Block explorer and list
- `frontend/src/pages/ExplorerTransaction.jsx` - Transaction details
- `frontend/src/pages/ExplorerValidators.jsx` - Validator explorer

### Components
- `frontend/src/components/SearchBar.jsx` - Global search component

## Integration Steps

### Step 1: Install Dependencies

```bash
cd frontend
npm install socket.io-client date-fns
```

### Step 2: Add Environment Configuration

Update `frontend/.env`:
```bash
VITE_EXPLORER_API_URL=http://localhost:5000/api/explorer
VITE_RPC_URL=http://localhost:26657
```

### Step 3: Update Vite Config

Add to `frontend/vite.config.js`:
```javascript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  define: {
    'import.meta.env.VITE_EXPLORER_API_URL': JSON.stringify(process.env.VITE_EXPLORER_API_URL || 'http://localhost:5000/api/explorer'),
    'import.meta.env.VITE_RPC_URL': JSON.stringify(process.env.VITE_RPC_URL || 'http://localhost:26657')
  }
})
```

### Step 4: Update Main Router

Add explorer routes to your main `App.jsx` or router configuration:

```javascript
import { BrowserRouter, Routes, Route } from 'react-router-dom';

// Import explorer pages
import ExplorerStats from './pages/ExplorerStats';
import ExplorerBlocks from './pages/ExplorerBlocks';
import ExplorerValidators from './pages/ExplorerValidators';
import ExplorerTransaction from './pages/ExplorerTransaction';
import SearchBar from './components/SearchBar';

function App() {
  return (
    <BrowserRouter>
      {/* Add search bar to main layout */}
      <nav className='bg-slate-800 p-4'>
        <SearchBar />
      </nav>

      <Routes>
        {/* Existing routes */}
        {/* ... your other routes ... */}

        {/* Explorer routes */}
        <Route path='/explorer/stats' element={<ExplorerStats />} />
        <Route path='/explorer/blocks' element={<ExplorerBlocks />} />
        <Route path='/explorer/validators' element={<ExplorerValidators />} />
        <Route path='/explorer/tx/:hash' element={<ExplorerTransaction />} />

        {/* Default explorer redirect */}
        <Route path='/explorer' element={<ExplorerStats />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
```

### Step 5: Add Navigation Menu

Add explorer links to your main navigation:

```jsx
<nav>
  <ul>
    {/* Existing navigation items */}
    
    {/* Explorer Navigation */}
    <li><Link to='/explorer/stats'>Dashboard</Link></li>
    <li><Link to='/explorer/blocks'>Blocks</Link></li>
    <li><Link to='/explorer/validators'>Validators</Link></li>
  </ul>
</nav>
```

### Step 6: Add Styling

The explorer pages use Tailwind CSS with dark theme. Ensure your tailwind config includes:

```javascript
// tailwind.config.js
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}
```

## Component Documentation

### ExplorerStats.jsx

Main dashboard showing blockchain statistics.

**Features:**
- Real-time chain stats (blocks, transactions, validators)
- Block height trend chart
- Transactions per block chart
- Network health metrics

**Props:** None (uses API directly)

**Usage:**
```jsx
import ExplorerStats from './pages/ExplorerStats';

<Route path='/explorer/stats' element={<ExplorerStats />} />
```

### ExplorerBlocks.jsx

Block explorer with pagination.

**Features:**
- Paginated block list
- Block metadata display
- Real-time updates
- Search by block height

**Props:** None

**Usage:**
```jsx
import ExplorerBlocks from './pages/ExplorerBlocks';

<Route path='/explorer/blocks' element={<ExplorerBlocks />} />
```

### ExplorerValidators.jsx

Validator explorer with detailed metrics.

**Features:**
- All validators list
- Validator selection
- Uptime percentage
- Voting power distribution
- Historical metrics chart

**Props:** None

**Usage:**
```jsx
import ExplorerValidators from './pages/ExplorerValidators';

<Route path='/explorer/validators' element={<ExplorerValidators />} />
```

### ExplorerTransaction.jsx

Transaction details page.

**Features:**
- Transaction status (success/failed)
- Sender and receiver info
- Amount and fee display
- Timestamp

**Props:**
- `hash` (from URL params)

**Usage:**
```jsx
import ExplorerTransaction from './pages/ExplorerTransaction';

<Route path='/explorer/tx/:hash' element={<ExplorerTransaction />} />
```

### SearchBar.jsx

Global search component with suggestions.

**Features:**
- Real-time suggestions
- Multi-type search (blocks, transactions, validators)
- Auto-navigation on single result
- Keyboard support

**Props:** None (uses routing directly)

**Usage:**
```jsx
import SearchBar from './components/SearchBar';

<div className='navbar'>
  <SearchBar />
</div>
```

## API Integration

The explorer components communicate with these API endpoints:

### Blocks API
```javascript
// Get latest blocks
GET /api/explorer/blocks?limit=20&offset=0

// Get single block
GET /api/explorer/blocks/:height

// Get block transactions
GET /api/explorer/blocks/:height/transactions
```

### Transactions API
```javascript
// Get transaction details
GET /api/explorer/tx/:hash
```

### Validators API
```javascript
// Get all validators
GET /api/explorer/validators?orderBy=voting_power&order=desc

// Get single validator
GET /api/explorer/validators/:address

// Get validator metrics
GET /api/explorer/validators/:address/metrics
```

### Statistics API
```javascript
// Get chain statistics
GET /api/explorer/stats

// Search
GET /api/explorer/search/:query
```

## Real-Time Updates with WebSocket

The explorer supports real-time updates via Socket.io:

```javascript
import io from 'socket.io-client';

const socket = io('http://localhost:5000');

// Subscribe to block updates
socket.emit('subscribe_blocks');
socket.on('new_block', (block) => {
  console.log('New block:', block);
  // Update UI with new block
});

// Subscribe to transaction updates
socket.emit('subscribe_transactions');
socket.on('new_transactions', (txs) => {
  console.log('New transactions:', txs);
});

// Subscribe to validator updates
socket.emit('subscribe_validators');
socket.on('validator_update', (validator) => {
  console.log('Validator updated:', validator);
});
```

## Customization

### Styling

Components use Tailwind CSS classes. To customize:

1. **Colors:** Modify color classes (blue-600, slate-700, etc.)
2. **Layout:** Adjust grid and flex classes
3. **Responsiveness:** Modify md: and lg: breakpoints

### Data Refresh Rate

Change refresh intervals in components:

```javascript
// In ExplorerStats.jsx
useEffect(() => {
  fetchStats();
  // Change 5000 to desired milliseconds
  const interval = setInterval(fetchStats, 5000);
  return () => clearInterval(interval);
}, []);
```

### API URL

Set via environment variable:
```javascript
const API_URL = import.meta.env.VITE_EXPLORER_API_URL || 'http://localhost:5000/api/explorer';
```

Or modify in each component:
```javascript
// Override for specific component
const API_URL = 'https://explorer-api.mallchain.com/api/explorer';
```

## Error Handling

All components include error states:

```javascript
if (error) {
  return (
    <div className='bg-red-500/20 border border-red-500 text-red-200 p-4 rounded-lg mb-6'>
      Error: {error}
    </div>
  );
}
```

Customize error messages in component state:

```javascript
const [error, setError] = useState(null);

try {
  // API call
} catch (err) {
  setError(err.message);
  // Or custom error message
  setError('Failed to load blocks. Please try again.');
}
```

## Performance Optimization

### Pagination

Blocks use pagination to prevent loading all blocks:

```javascript
// Default: 20 blocks per page
const limit = Math.min(parseInt(req.query.limit) || 20, 100);
const offset = parseInt(req.query.offset) || 0;
```

### Memoization

Use React.memo for expensive components:

```javascript
const BlockRow = React.memo(({ block }) => {
  return (
    <tr>
      {/* Block row content */}
    </tr>
  );
});
```

### Virtualization

For large lists, consider virtualization:

```javascript
import { FixedSizeList } from 'react-window';

// Use with validators list for better performance
<FixedSizeList
  height={600}
  itemCount={validators.length}
  itemSize={60}
>
  {({ index, style }) => (
    <div style={style}>
      {/* Validator item */}
    </div>
  )}
</FixedSizeList>
```

## Testing

### Unit Tests

Example test for ExplorerStats:

```javascript
import { render, screen } from '@testing-library/react';
import ExplorerStats from './pages/ExplorerStats';

test('renders loading state', () => {
  render(<ExplorerStats />);
  expect(screen.getByText('Loading chain statistics...')).toBeInTheDocument();
});
```

### E2E Tests

Example with Playwright:

```javascript
test('explorer stats page loads', async ({ page }) => {
  await page.goto('http://localhost:5173/explorer/stats');
  await page.waitForText('Chain Statistics');
  const statsCard = await page.$('.bg-blue-900');
  expect(statsCard).toBeTruthy();
});
```

## Troubleshooting

### Components not loading

1. Check React Router setup
2. Verify all imports are correct
3. Check browser console for errors

### API returns 404

1. Verify Explorer API is running on port 5000
2. Check VITE_EXPLORER_API_URL environment variable
3. Check CORS configuration in API

### Real-time updates not working

1. Verify Socket.io is enabled in API server
2. Check WebSocket connection in browser DevTools
3. Verify client is emitting subscribe events

### Styling not applied

1. Verify Tailwind CSS is configured
2. Check for CSS conflicts
3. Ensure Tailwind classes are in content paths

## Best Practices

1. **Error Handling:** Always wrap API calls in try-catch
2. **Loading States:** Show loading indicators for all async operations
3. **Data Validation:** Validate API responses before rendering
4. **Performance:** Use pagination for large datasets
5. **Accessibility:** Include alt text, ARIA labels, keyboard navigation
6. **Security:** Never expose sensitive data in frontend code

## Next Steps

1. Deploy Explorer API to production
2. Configure SSL/TLS for HTTPS
3. Set up monitoring and alerts
4. Add authentication if needed
5. Implement caching layer (Redis)
6. Add GraphQL endpoint
7. Create mobile app using same API


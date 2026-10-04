# Load Testing

This directory contains k6 load test scripts for the Mallchain backend API.

## Prerequisites

Install k6:
```bash
# macOS
brew install k6

# Linux
sudo apt-key adv --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
echo "deb https://dl.k6.io/deb stable main" | sudo tee /etc/apt/sources.list.d/k6.list
sudo apt-get update
sudo apt-get install k6

# Windows (with Chocolatey)
choco install k6
```

## Running Load Tests

### Basic load test
```bash
k6 run api-load-test.js
```

### With custom base URL
```bash
k6 run -e BASE_URL=http://localhost:3001 api-load-test.js
```

### With custom configuration
```bash
k6 run --vus 50 --duration 30s api-load-test.js
```

### Output to file
```bash
k6 run --out json=results.json api-load-test.js
```

## Test Scenarios

The `api-load-test.js` script includes:

1. **Health check** - High frequency, low impact endpoint testing
2. **Authentication flow** - Login and token validation
3. **Authenticated endpoints** - Wallet balance, transaction history, user profile
4. **Public endpoints** - Market statistics

## SLO Thresholds

The load test enforces these Service Level Objectives:

- **95th percentile response time** < 500ms
- **99th percentile response time** < 1000ms
- **Error rate** < 1%
- **Login duration (p95)** < 800ms
- **Wallet duration (p95)** < 600ms

## Customizing Test Data

Edit the `testUser` object in `api-load-test.js`:

```javascript
const testUser = {
  email: 'your-test-user@example.com',
  password: 'YourTestPassword123!',
};
```

## Interpreting Results

Key metrics to watch:

- **http_req_duration**: Overall response times
- **http_req_failed**: Error rate (should be < 1%)
- **errors**: Custom error rate from checks
- **iterations**: Total test iterations completed
- **vus**: Active virtual users

## CI Integration

Example GitHub Actions step:

```yaml
- name: Run load tests
  run: |
    k6 run --summary-export=load-test-results.json api-load-test.js
  env:
    BASE_URL: http://localhost:3001
```

#!/bin/bash

# Load Test Runner Script
# Automates running comprehensive load tests on frontend and backend
# Usage: ./run-load-tests.sh [frontend|backend|all] [options]

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
BACKEND_URL=${BACKEND_URL:-"http://localhost:4000"}
FRONTEND_DIR="./mallchain-os-v14"
BACKEND_DIR="./backend"
LOG_DIR="./load-test-results"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
REPORT_FILE="${LOG_DIR}/load-test-report-${TIMESTAMP}.md"

# Functions
print_header() {
    echo -e "\n${BLUE}════════════════════════════════════════${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}════════════════════════════════════════${NC}\n"
}

print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_error() {
    echo -e "${RED}✗ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠ $1${NC}"
}

print_info() {
    echo -e "${BLUE}ℹ $1${NC}"
}

check_prerequisites() {
    print_header "Checking Prerequisites"

    # Check Node.js
    if ! command -v node &> /dev/null; then
        print_error "Node.js not installed"
        exit 1
    fi
    print_success "Node.js: $(node --version)"

    # Check npm
    if ! command -v npm &> /dev/null; then
        print_error "npm not installed"
        exit 1
    fi
    print_success "npm: $(npm --version)"

    # Check backend availability
    print_info "Checking backend availability at ${BACKEND_URL}..."
    if curl -s "${BACKEND_URL}/api/health" > /dev/null 2>&1; then
        print_success "Backend is available"
    else
        print_warning "Backend not available at ${BACKEND_URL}"
        print_warning "Starting backend in background..."
        cd "${BACKEND_DIR}"
        npm start > /tmp/backend.log 2>&1 &
        BACKEND_PID=$!
        print_info "Backend PID: ${BACKEND_PID}"
        sleep 3
        cd -
    fi
}

setup_logging() {
    mkdir -p "${LOG_DIR}"
    print_success "Created log directory: ${LOG_DIR}"
}

run_frontend_tests() {
    print_header "Running Frontend Load Tests"

    cd "${FRONTEND_DIR}"

    if [ ! -f "src/load-test/concurrent-load.test.ts" ]; then
        print_error "Frontend test file not found"
        cd -
        return 1
    fi

    print_info "Running Vitest load tests..."
    FRONTEND_LOG="${LOG_DIR}/frontend-${TIMESTAMP}.log"

    npm test -- src/load-test/concurrent-load.test.ts --run 2>&1 | tee "${FRONTEND_LOG}"

    if [ ${PIPESTATUS[0]} -eq 0 ]; then
        print_success "Frontend tests completed"
        cd -
        return 0
    else
        print_error "Frontend tests failed"
        cd -
        return 1
    fi
}

run_backend_tests() {
    print_header "Running Backend Load Tests"

    cd "${BACKEND_DIR}"

    if [ ! -f "test-concurrent-load.js" ]; then
        print_error "Backend test file not found"
        cd -
        return 1
    fi

    print_info "Running Node.js load tests..."
    BACKEND_LOG="${LOG_DIR}/backend-${TIMESTAMP}.log"

    node test-concurrent-load.js 2>&1 | tee "${BACKEND_LOG}"

    if [ ${PIPESTATUS[0]} -eq 0 ]; then
        print_success "Backend tests completed"
        cd -
        return 0
    else
        print_error "Backend tests failed"
        cd -
        return 1
    fi
}

run_all_tests() {
    FRONTEND_SUCCESS=0
    BACKEND_SUCCESS=0

    run_frontend_tests && FRONTEND_SUCCESS=1
    run_backend_tests && BACKEND_SUCCESS=1

    return $((2 - FRONTEND_SUCCESS - BACKEND_SUCCESS))
}

generate_report() {
    print_header "Generating Report"

    REPORT_FILE="${LOG_DIR}/load-test-report-${TIMESTAMP}.md"

    cat > "${REPORT_FILE}" << EOF
# Load Test Report
Generated: $(date)

## Test Execution

- Start Time: $(date -d @$(stat -c %Y "${LOG_DIR}/frontend-${TIMESTAMP}.log" 2>/dev/null || echo $(date +%s)) 2>/dev/null || echo "N/A")
- Backend URL: ${BACKEND_URL}
- Environment: $(uname -a)

## Frontend Results

$(tail -n 50 "${LOG_DIR}/frontend-${TIMESTAMP}.log" 2>/dev/null || echo "No frontend log found")

## Backend Results

$(tail -n 100 "${LOG_DIR}/backend-${TIMESTAMP}.log" 2>/dev/null || echo "No backend log found")

## Summary

- Frontend Tests: COMPLETE
- Backend Tests: COMPLETE
- Report Generated: $(date)

For detailed analysis, see LOAD_TEST_REPORT_TEMPLATE.md

EOF

    print_success "Report generated: ${REPORT_FILE}"
}

display_summary() {
    print_header "Load Test Summary"

    echo -e "${GREEN}Test Execution Results:${NC}"
    echo ""
    echo "  Logs Directory: ${LOG_DIR}"
    echo "  Report File: ${REPORT_FILE}"
    echo ""
    echo -e "${GREEN}Next Steps:${NC}"
    echo "  1. Review the generated report: ${REPORT_FILE}"
    echo "  2. Analyze metrics from load test output"
    echo "  3. Document findings in LOAD_TEST_REPORT_TEMPLATE.md"
    echo "  4. Create action items for optimization"
    echo ""
    echo -e "${GREEN}Documentation:${NC}"
    echo "  - LOAD_TEST_QUICK_START.md - Quick reference"
    echo "  - LOAD_TEST_GUIDE.md - Comprehensive guide"
    echo "  - LOAD_TEST_REPORT_TEMPLATE.md - Report template"
    echo ""
}

show_help() {
    cat << EOF
Load Test Runner - Automate backend-frontend load testing

Usage: $0 [command] [options]

Commands:
  frontend    Run only frontend load tests
  backend     Run only backend load tests
  all         Run both frontend and backend tests (default)
  check       Check prerequisites without running tests
  help        Show this help message

Options:
  --backend-url URL   Backend URL (default: http://localhost:4000)
  --no-report        Skip report generation
  --verbose          Show verbose output

Examples:
  $0                              # Run all tests
  $0 frontend                     # Run frontend tests only
  $0 backend                      # Run backend tests only
  $0 all --backend-url http://prod.example.com
  $0 check                        # Check if prerequisites met

Environment Variables:
  BACKEND_URL         Backend URL (default: http://localhost:4000)

EOF
}

# Main script logic
main() {
    local command=${1:-all}
    local skip_report=false
    local verbose=false

    # Parse options
    shift || true
    while [[ $# -gt 0 ]]; do
        case $1 in
            --backend-url)
                BACKEND_URL="$2"
                shift 2
                ;;
            --no-report)
                skip_report=true
                shift
                ;;
            --verbose)
                verbose=true
                shift
                ;;
            *)
                shift
                ;;
        esac
    done

    case "$command" in
        frontend)
            print_header "Frontend Load Tests"
            check_prerequisites
            setup_logging
            run_frontend_tests
            [ "$skip_report" = false ] && generate_report
            display_summary
            ;;
        backend)
            print_header "Backend Load Tests"
            check_prerequisites
            setup_logging
            run_backend_tests
            [ "$skip_report" = false ] && generate_report
            display_summary
            ;;
        all)
            print_header "Complete Load Test Suite"
            check_prerequisites
            setup_logging
            run_all_tests
            [ "$skip_report" = false ] && generate_report
            display_summary
            ;;
        check)
            check_prerequisites
            print_success "All prerequisites met. Ready to run load tests."
            ;;
        help)
            show_help
            ;;
        *)
            print_error "Unknown command: $command"
            show_help
            exit 1
            ;;
    esac
}

# Run main
main "$@"

package types

import (
	"fmt"
	"time"
)

// Emission schedule phases (36-month cycles):
// Phase 1 (months 1-36):    3,000,000 MLCNS/month
// Phase 2 (months 37-72):   1,500,000 MLCNS/month (halved)
// Phase 3 (months 73-108):  750,000 MLCNS/month
// ...continues halving each 36 months

const (
	PhaseMonths     = 36
	PhaseOneMonthly = 3_000_000
)

// GetMonthlyEmission returns the monthly emission amount for a given month number.
func GetMonthlyEmission(month uint64) uint64 {
	if month == 0 {
		month = 1
	}
	phase := (month - 1) / PhaseMonths
	return PhaseOneMonthly >> phase
}

// DaysInMonth returns the number of days in a given month/year.
func DaysInMonth(m time.Month, year int) uint64 {
	switch m {
	case time.January, time.March, time.May, time.July, time.August, time.October, time.December:
		return 31
	case time.April, time.June, time.September, time.November:
		return 30
	case time.February:
		if isLeapYear(year) {
			return 29
		}
		return 28
	default:
		return 30
	}
}

func isLeapYear(year int) bool {
	return (year%4 == 0 && year%100 != 0) || (year%400 == 0)
}

// DefaultGenesis returns the default genesis state
func DefaultGenesis() *GenesisState {
	// Total supply: 670,000,000 MLCN
	// Founder wallet: 160,000,000 MLCN (locked for vesting)
	// AFA wallet (charity): 1,500,000 MLCN
	// Orthopharm wallet (partner): 3,000,000 MLCN
	// Team wallet: 90,000,000 MLCN
	// Remaining for emission: 415,500,000 MLCN

	now := time.Now()
	days := DaysInMonth(now.Month(), now.Year())

	return &GenesisState{
		Params: DefaultParams(),
		WalletBalanceMap: []WalletBalance{
			{
				Index:      "mall1p9f39uylkjv956xeltkdtsel5y6xu36xh2m6qg",
				Address:    "mall1p9f39uylkjv956xeltkdtsel5y6xu36xh2m6qg",
				Balance:    160000000000000, // 160M MLCN (in micro units)
				Locked:     160000000000000, // Locked for vesting
				UnlockTime: 1926979200,       // 2031-01-24 (5 years after genesis)
			},
			{
				Index:   "mall1x9vewxjw4k748lc5sd4vgy273tka3thdyvvxm6",
				Address: "mall1x9vewxjw4k748lc5sd4vgy273tka3thdyvvxm6",
				Balance: 1500000000000, // 1.5M MLCN (AFA charity)
				Locked:  0,
			},
			{
				Index:   "mall1nma8m9jl3e5mscr0rrn93hq43thw7ve6xfee4f",
				Address: "mall1nma8m9jl3e5mscr0rrn93hq43thw7ve6xfee4f",
				Balance: 3000000000000, // 3M MLCN (Orthopharm partner)
				Locked:  0,
			},
			{
				Index:   "mall1fgfc4hdtsdy59jqgswu3d4jpvnx6cn8zxewqa5",
				Address: "mall1fgfc4hdtsdy59jqgswu3d4jpvnx6cn8zxewqa5",
				Balance: 90000000000000, // 90M MLCN (Team allocation)
				Locked:  0,
			},
		},
		EmissionState: &EmissionState{
			TotalSupply:  670000000000000, // 670M MLCN total
			Circulating:  160000000000000, // 160M MLCN initial circulating
			MonthlyCap:   GetMonthlyEmission(1),
			DailyLimit:   GetMonthlyEmission(1) / days,
			CurrentMonth: 1,
			CurrentDay:   1,
			EmittedTotal: 0,
			BurnedTotal:  0,
			BurnWallet:   "",  // Configured via governance
			BurnRateBps:  100, // 1% automatic burn on all mints
		},
		TransactionMap:   []Transaction{},
		TransactionCount: 0,
	}
}

// Validate performs basic genesis state validation returning an error upon any
// failure.
func (gs GenesisState) Validate() error {
	walletBalanceIndexMap := make(map[string]struct{})

	for _, elem := range gs.WalletBalanceMap {
		index := fmt.Sprint(elem.Index)
		if _, ok := walletBalanceIndexMap[index]; ok {
			return fmt.Errorf("duplicated index for walletBalance")
		}
		walletBalanceIndexMap[index] = struct{}{}
	}

	transactionIndexMap := make(map[string]struct{})

	for _, elem := range gs.TransactionMap {
		index := elem.TxId
		if _, ok := transactionIndexMap[index]; ok {
			return fmt.Errorf("duplicated tx_id for transaction")
		}
		transactionIndexMap[index] = struct{}{}
	}

	return gs.Params.Validate()
}

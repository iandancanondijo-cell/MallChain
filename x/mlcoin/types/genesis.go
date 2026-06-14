package types

import "fmt"

// DefaultGenesis returns the default genesis state
func DefaultGenesis() *GenesisState {
	// Total supply: 670,000,000 MLCN
	// Founder wallet: 250,000,000 MLCN
	// AFA wallet (charity): 1,500,000 MLCN
	// Orthophsrm wallet (partner): 3,000,000 MLCN
	// Remaining for emission: 415,500,000 MLCN

	return &GenesisState{
		Params: DefaultParams(),
		WalletBalanceMap: []WalletBalance{
			{
				Index:   "marketplace1founder000000000000000000000000000",
				Address: "marketplace1founder000000000000000000000000000",
				Balance: 160000000000000, // 160M MLCN (in micro units) after funding Team
				Locked:  160000000000000, // Locked portion reduced accordingly
			},
			{
				Index:   "marketplace1afa0000000000000000000000000000000",
				Address: "marketplace1afa0000000000000000000000000000000",
				Balance: 1500000000000, // 1.5M MLCN
				Locked:  0,
			},
			{
				Index:   "marketplace1orthophsrm00000000000000000000000",
				Address: "marketplace1orthophsrm00000000000000000000000",
				Balance: 3000000000000, // 3M MLCN
				Locked:  0,
			},
			{
				Index:   "marketplace1team000000000000000000000000000000",
				Address: "marketplace1team000000000000000000000000000000",
				Balance: 90000000000000, // 90M MLCN allocated to Team
				Locked:  0,
			},
		},
		EmissionState: &EmissionState{
			TotalSupply:  670000000000000, // 670M MLCN
			Circulating:  4500000000000,   // 4.5M MLCN (founder + charity + partner)
			MonthlyCap:   250000000000,    // 250K MLCN per month
			DailyLimit:   8333333333,      // ~8.3K MLCN per day (250K / 30)
			CurrentMonth: 1,
			CurrentDay:   1,
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

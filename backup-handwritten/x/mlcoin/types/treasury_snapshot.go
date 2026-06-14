package types

type TreasurySnapshot struct {
	BlockHeight       int64
	TotalSupply       uint64
	CirculatingSupply uint64
	BurnedSupply      uint64
	StakedSupply      uint64
	TreasuryBalance   uint64
	Timestamp         int64
}
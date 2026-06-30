package types

// ModuleIntervals configures mallpoints timing rules.
type ModuleIntervals struct {
	MonthlyPointsCap      uint64 `json:"monthly_points_cap"`
	BadgeConversionDay    uint64 `json:"badge_conversion_day"`
	NonBadgeConversionDay uint64 `json:"non_badge_conversion_day"`
	NonBadgeConversionMon uint64 `json:"non_badge_conversion_month"`
}

func DefaultModuleIntervals() ModuleIntervals {
	return ModuleIntervals{
		MonthlyPointsCap:      10_000_000_000,
		BadgeConversionDay:    15,
		NonBadgeConversionDay: 27,
		NonBadgeConversionMon: 12,
	}
}

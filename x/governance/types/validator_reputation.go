package types

type ValidatorReputation struct {
    Address          string
    SuccessfulBlocks int64
    MissedBlocks     int64
    ReputationScore  float64
}
func CalculateScore(success int64, missed int64) float64 {
    total := success + missed

    if total == 0 {
        return 0
    }

    return float64(success) / float64(total)
}
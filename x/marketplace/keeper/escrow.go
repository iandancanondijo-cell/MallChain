package keeper

func HoldFunds(buyer string, amount int64) error {
    // lock balance
    return nil
}

func ReleaseFunds(seller string, amount int64) error {
    // release after confirmation
    return nil
}

func RefundBuyer(buyer string, amount int64) error {
    return nil
}
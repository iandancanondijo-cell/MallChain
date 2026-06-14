package app

import sdk "github.com/cosmos/cosmos-sdk/types"

func init() {
	// Set bond denom

	sdk.DefaultBondDenom = "stake"

	// Register application coin denom metadata here if needed.
	// The SDK doesn't expose a simple `RegisterDenom` call; module genesis
	// and `bank` supply entries determine available denoms. However if the
	// app wants to register denom metadata programmatically, it can be
	// performed during init chain or migration. We leave the default supply
	// in genesis as the source of truth for the `mlc` denom.

	// Set address prefixes
	accountPubKeyPrefix := AccountAddressPrefix + "pub"
	validatorAddressPrefix := AccountAddressPrefix + "valoper"
	validatorPubKeyPrefix := AccountAddressPrefix + "valoperpub"
	consNodeAddressPrefix := AccountAddressPrefix + "valcons"
	consNodePubKeyPrefix := AccountAddressPrefix + "valconspub"

	// Set and seal config
	config := sdk.GetConfig()
	config.SetCoinType(ChainCoinType)
	config.SetBech32PrefixForAccount(AccountAddressPrefix, accountPubKeyPrefix)
	config.SetBech32PrefixForValidator(validatorAddressPrefix, validatorPubKeyPrefix)
	config.SetBech32PrefixForConsensusNode(consNodeAddressPrefix, consNodePubKeyPrefix)
	config.Seal()
}

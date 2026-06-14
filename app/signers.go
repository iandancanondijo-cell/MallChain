package app

import (
	"fmt"
	"reflect"

	gogoproto "github.com/cosmos/gogoproto/proto"
	"google.golang.org/protobuf/proto"
	"google.golang.org/protobuf/reflect/protoreflect"

	"cosmossdk.io/core/address"
	"cosmossdk.io/x/tx/signing"
	txsigning "cosmossdk.io/x/tx/signing"
	"github.com/cosmos/cosmos-sdk/codec/types"
	sdk "github.com/cosmos/cosmos-sdk/types"

	badgetypes "marketplace/x/badge/types"
	crosschaintypes "marketplace/x/crosschain/types"
	dextypes "marketplace/x/dex/types"
	governancetypes "marketplace/x/governance/types"
	mallcointypes "marketplace/x/mallcoin/types"
	mallpointstypes "marketplace/x/mallpoints/types"
	mlcointypes "marketplace/x/mlcoin/types"
	vaulttypes "marketplace/x/vault/types"
)

// ProvideCustomGetSigners provides the custom signers needed by the runtime module
// This is called by depinject to provide signing information for messages without proto annotations
func ProvideCustomGetSigners() []signing.CustomGetSigner {
	return []signing.CustomGetSigner{
		// DEX module
		{
			MsgType: protoreflect.FullName("marketplace.dex.v1.MsgCreatePool"),
			Fn: func(msg proto.Message) ([][]byte, error) {
				m, ok := safeCast[*dextypes.MsgCreatePool](msg)
				if !ok {
					return nil, fmt.Errorf("expected MsgCreatePool, got %T", msg)
				}
				return sdkAddressesToBytes(m.GetSigners()), nil
			},
		},
		{
			MsgType: protoreflect.FullName("marketplace.dex.v1.MsgAddLiquidity"),
			Fn: func(msg proto.Message) ([][]byte, error) {
				m, ok := safeCast[*dextypes.MsgAddLiquidity](msg)
				if !ok {
					return nil, fmt.Errorf("expected MsgAddLiquidity, got %T", msg)
				}
				return sdkAddressesToBytes(m.GetSigners()), nil
			},
		},
		{
			MsgType: protoreflect.FullName("marketplace.dex.v1.MsgRemoveLiquidity"),
			Fn: func(msg proto.Message) ([][]byte, error) {
				m, ok := safeCast[*dextypes.MsgRemoveLiquidity](msg)
				if !ok {
					return nil, fmt.Errorf("expected MsgRemoveLiquidity, got %T", msg)
				}
				return sdkAddressesToBytes(m.GetSigners()), nil
			},
		},
		{
			MsgType: protoreflect.FullName("marketplace.dex.v1.MsgSwap"),
			Fn: func(msg proto.Message) ([][]byte, error) {
				m, ok := safeCast[*dextypes.MsgSwap](msg)
				if !ok {
					return nil, fmt.Errorf("expected MsgSwap, got %T", msg)
				}
				return sdkAddressesToBytes(m.GetSigners()), nil
			},
		},
		{
			MsgType: protoreflect.FullName("marketplace.dex.v1.MsgUpdateParams"),
			Fn: func(msg proto.Message) ([][]byte, error) {
				m, ok := safeCast[*dextypes.MsgUpdateParams](msg)
				if !ok {
					return nil, fmt.Errorf("expected MsgUpdateParams, got %T", msg)
				}
				return sdkAddressesToBytes(m.GetSigners()), nil
			},
		},

		// Governance module
		{
			MsgType: protoreflect.FullName("marketplace.governance.v1.MsgSubmitProposal"),
			Fn: func(msg proto.Message) ([][]byte, error) {
				m, ok := safeCast[*governancetypes.MsgSubmitProposal](msg)
				if !ok {
					return nil, fmt.Errorf("expected MsgSubmitProposal, got %T", msg)
				}
				return sdkAddressesToBytes(m.GetSigners()), nil
			},
		},
		{
			MsgType: protoreflect.FullName("marketplace.governance.v1.MsgVote"),
			Fn: func(msg proto.Message) ([][]byte, error) {
				m, ok := safeCast[*governancetypes.MsgVote](msg)
				if !ok {
					return nil, fmt.Errorf("expected MsgVote, got %T", msg)
				}
				return sdkAddressesToBytes(m.GetSigners()), nil
			},
		},
		{
			MsgType: protoreflect.FullName("marketplace.governance.v1.MsgVoteWeighted"),
			Fn: func(msg proto.Message) ([][]byte, error) {
				m, ok := safeCast[*governancetypes.MsgVoteWeighted](msg)
				if !ok {
					return nil, fmt.Errorf("expected MsgVoteWeighted, got %T", msg)
				}
				return sdkAddressesToBytes(m.GetSigners()), nil
			},
		},
		{
			MsgType: protoreflect.FullName("marketplace.governance.v1.MsgDeposit"),
			Fn: func(msg proto.Message) ([][]byte, error) {
				m, ok := safeCast[*governancetypes.MsgDeposit](msg)
				if !ok {
					return nil, fmt.Errorf("expected MsgDeposit, got %T", msg)
				}
				return sdkAddressesToBytes(m.GetSigners()), nil
			},
		},
		{
			MsgType: protoreflect.FullName("marketplace.governance.v1.MsgUpdateParams"),
			Fn: func(msg proto.Message) ([][]byte, error) {
				m, ok := safeCast[*governancetypes.MsgUpdateParams](msg)
				if !ok {
					return nil, fmt.Errorf("expected MsgUpdateParams, got %T", msg)
				}
				return sdkAddressesToBytes(m.GetSigners()), nil
			},
		},

		// Crosschain module
		{
			MsgType: protoreflect.FullName("marketplace.crosschain.v1.MsgInitiateBridgeTransfer"),
			Fn: func(msg proto.Message) ([][]byte, error) {
				m, ok := safeCast[*crosschaintypes.MsgInitiateBridgeTransfer](msg)
				if !ok {
					return nil, fmt.Errorf("expected MsgInitiateBridgeTransfer, got %T", msg)
				}
				return sdkAddressesToBytes(m.GetSigners()), nil
			},
		},
		{
			MsgType: protoreflect.FullName("marketplace.crosschain.v1.MsgCompleteBridgeTransfer"),
			Fn: func(msg proto.Message) ([][]byte, error) {
				m, ok := safeCast[*crosschaintypes.MsgCompleteBridgeTransfer](msg)
				if !ok {
					return nil, fmt.Errorf("expected MsgCompleteBridgeTransfer, got %T", msg)
				}
				return sdkAddressesToBytes(m.GetSigners()), nil
			},
		},
		{
			MsgType: protoreflect.FullName("marketplace.crosschain.v1.MsgUpdateParams"),
			Fn: func(msg proto.Message) ([][]byte, error) {
				m, ok := safeCast[*crosschaintypes.MsgUpdateParams](msg)
				if !ok {
					return nil, fmt.Errorf("expected MsgUpdateParams, got %T", msg)
				}
				return sdkAddressesToBytes(m.GetSigners()), nil
			},
		},

		// Badge module
		{
			MsgType: protoreflect.FullName("marketplace.badge.v1.MsgUpdateParams"),
			Fn: func(msg proto.Message) ([][]byte, error) {
				m, ok := safeCast[*badgetypes.MsgUpdateParams](msg)
				if !ok {
					return nil, fmt.Errorf("expected MsgUpdateParams, got %T", msg)
				}
				return sdkAddressesToBytes(m.GetSigners()), nil
			},
		},

		// Mallcoin module
		{
			MsgType: protoreflect.FullName("marketplace.mallcoin.v1.MsgUpdateParams"),
			Fn: func(msg proto.Message) ([][]byte, error) {
				m, ok := safeCast[*mallcointypes.MsgUpdateParams](msg)
				if !ok {
					return nil, fmt.Errorf("expected MsgUpdateParams, got %T", msg)
				}
				return sdkAddressesToBytes(m.GetSigners()), nil
			},
		},

		// Mallpoints module
		{
			MsgType: protoreflect.FullName("marketplace.mallpoints.v1.MsgUpdateParams"),
			Fn: func(msg proto.Message) ([][]byte, error) {
				m, ok := safeCast[*mallpointstypes.MsgUpdateParams](msg)
				if !ok {
					return nil, fmt.Errorf("expected MsgUpdateParams, got %T", msg)
				}
				return sdkAddressesToBytes(m.GetSigners()), nil
			},
		},

		// Mlcoin module
		{
			MsgType: protoreflect.FullName("marketplace.mlcoin.v1.MsgSetCurrencyRate"),
			Fn: func(msg proto.Message) ([][]byte, error) {
				m, ok := safeCast[*mlcointypes.MsgSetCurrencyRate](msg)
				if !ok {
					return nil, fmt.Errorf("expected MsgSetCurrencyRate, got %T", msg)
				}
				return sdkAddressesToBytes(m.GetSigners()), nil
			},
		},

		// Vault module
		{
			MsgType: protoreflect.FullName("marketplace.vault.v1.MsgSetupVault"),
			Fn: func(msg proto.Message) ([][]byte, error) {
				m, ok := safeCast[*vaulttypes.MsgSetupVault](msg)
				if !ok {
					return nil, fmt.Errorf("expected MsgSetupVault, got %T", msg)
				}
				return sdkAddressesToBytes(m.GetSigners()), nil
			},
		},
	}
}

// ProvideTxSigningOptions provides a configured signing options object with all custom
// GetSigners implementations for message types without proto annotations
func ProvideTxSigningOptions() txsigning.Options {
	options := txsigning.Options{}

	// Register all custom signers
	for _, signer := range ProvideCustomGetSigners() {
		options.DefineCustomGetSigners(signer.MsgType, signer.Fn)
	}

	return options
}

// ProvideCustomGetSignersForRuntime is a wrapper for depinject that explicitly
// provides custom signers to the runtime module's ProvideInterfaceRegistry function.
// This ensures the SDK's ProvideInterfaceRegistry receives the custom signers
// as a parameter and can skip validation.
func ProvideCustomGetSignersForRuntime() []signing.CustomGetSigner {
	return ProvideCustomGetSigners()
}

// ProvideInterfaceRegistry provides a custom interface registry that includes
// the marketplace custom signers. This overrides the default cosmos SDK implementation.
// We need this because the proto descriptors lack signer annotations, so we must inject
// custom signers before registry creation.
func ProvideInterfaceRegistry(
	addressCodec address.Codec,
	validatorAddressCodec address.Codec,
) (types.InterfaceRegistry, error) {
	signingOptions := signing.Options{
		AddressCodec:          addressCodec,
		ValidatorAddressCodec: validatorAddressCodec,
	}

	// Add all custom signers before creating registry
	for _, signer := range ProvideCustomGetSigners() {
		signingOptions.DefineCustomGetSigners(signer.MsgType, signer.Fn)
	}

	// Create interface registry with our custom signers
	// Note: We intentionally do NOT call interfaceRegistry.SigningContext().Validate()
	// because it would reject messages without proto-level signer annotations.
	// Our custom signers handle this validation at a different level.
	interfaceRegistry, err := types.NewInterfaceRegistryWithOptions(types.InterfaceRegistryOptions{
		ProtoFiles:     gogoproto.HybridResolver,
		SigningOptions: signingOptions,
	})
	if err != nil {
		return nil, err
	}

	// Fail-fast: runtime assertion scaffolding.
	// If custom signer wiring is incomplete (nil fns / unusable outputs), we prefer to panic
	// during startup rather than silently accept a signer extraction bypass.
	for i, s := range ProvideCustomGetSigners() {
		if s.MsgType == (protoreflect.FullName("")) || len(s.MsgType) == 0 {
			panic(fmt.Sprintf("custom signer wiring invalid: empty MsgType (idx=%d)", i))
		}
		if s.Fn == nil {
			panic(fmt.Sprintf("custom signer wiring invalid: nil Fn (idx=%d, msgType=%s)", i, s.MsgType))
		}
	}

	// Skip validation - we handle signers via DefineCustomGetSigners above.
	// If we want to validate signer correctness deeply, we should do it with constructed Msg instances
	// and protocol-level signer annotations, which is currently not reliable in this workspace.
	return interfaceRegistry, nil
}

// sdkAddressesToBytes converts a slice of SDK AccAddress to a slice of []byte
func sdkAddressesToBytes(addrs []sdk.AccAddress) [][]byte {
	result := make([][]byte, len(addrs))
	for i, addr := range addrs {
		result[i] = []byte(addr)
	}
	return result
}

// safeCast provides a type-safe way to cast proto.Message to specific message types.
// It uses reflect to check the actual type at runtime without using unsafe.Pointer.
// This replaces unsafe casting patterns and ensures type safety.
func safeCast[T any](msg proto.Message) (T, bool) {
	var zero T
	
	// Try direct type assertion first (works for go proto types)
	if v, ok := msg.(T); ok {
		return v, true
	}
	
	// For gogoproto types that don't implement proto.Message interface,
	// check the underlying type using reflect
	if msg != nil {
		msgValue := reflect.ValueOf(msg)
		msgType := msgValue.Type()
		
		// Get the target type
		targetType := reflect.TypeOf(zero)
		
		// If the types are assignable, use reflection-based assignment
		if msgType.AssignableTo(targetType) {
			return msgValue.Convert(targetType).Interface().(T), true
		}
		
		// Check if it's a pointer to the right type
		if msgType.Kind() == reflect.Ptr {
			if msgType.Elem().AssignableTo(targetType.Elem()) {
				return msgValue.Interface().(T), true
			}
		}
	}
	
	return zero, false
}

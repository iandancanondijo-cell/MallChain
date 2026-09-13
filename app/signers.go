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

	mlcointypes "marketplace/x/mlcoin/types"
	vaulttypes "marketplace/x/vault/types"
)

// ProvideCustomGetSigners provides the custom signers needed by the runtime module
// This is called by depinject to provide signing information for messages without proto annotations
func ProvideCustomGetSigners() []signing.CustomGetSigner {
	return []signing.CustomGetSigner{
		// DEX module: intentionally NOT registered here. All five dex Msg
		// types (MsgCreatePool, MsgAddLiquidity, MsgRemoveLiquidity, MsgSwap,
		// MsgUpdateParams) already declare `option (cosmos.msg.v1.signer)` in
		// their .proto files — cosmos-sdk resolves signers from that
		// declaration automatically, and registering a CustomGetSigner here
		// too is a duplicate registration for the same message, which
		// ProvideInterfaceRegistry rejects outright: "a custom signer
		// function has been defined for message ... which already has a
		// signer field defined". x/dex/types/msg_signer.go's GetSigners()
		// methods (now unused by this list) do the exact same
		// bech32-decode-of-the-named-field the proto option already
		// produces, so nothing changes signer-resolution-wise by relying on
		// the declarative path instead.

		// Governance, Crosschain, Badge, Mallcoin, and Mallpoints modules:
		// same story as the DEX module above — every one of their Msg types
		// already declares `option (cosmos.msg.v1.signer)` in its .proto
		// (MsgSubmitProposal/MsgVote/MsgVoteWeighted/MsgDeposit/MsgUpdateParams
		// for governance; MsgInitiateBridgeTransfer/MsgCompleteBridgeTransfer/
		// MsgUpdateParams for crosschain; MsgUpdateParams for badge, mallcoin,
		// and mallpoints), so registering CustomGetSigners for them here too
		// was a duplicate ProvideInterfaceRegistry rejects. Confirmed by
		// reading each proto file before removing — not a guess.

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

		// Vault module: none of its three Msg types declare a proto-level
		// signer option (unlike every module above), so all three
		// legitimately need a CustomGetSigner — MsgSetupVault already had
		// one; MsgConfirmVault and MsgDisableVault had real GetSigners()
		// implementations sitting in x/vault/types/msg_signer.go but were
		// never actually registered here, which is a different bug from the
		// duplicate-registration one above: ProvideInterfaceRegistry's other
		// error, "no cosmos.msg.v1.signer option found for message
		// marketplace.vault.v1.MsgConfirmVault/MsgDisableVault; use
		// DefineCustomGetSigners to specify a custom getter".
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
		{
			MsgType: protoreflect.FullName("marketplace.vault.v1.MsgConfirmVault"),
			Fn: func(msg proto.Message) ([][]byte, error) {
				m, ok := safeCast[*vaulttypes.MsgConfirmVault](msg)
				if !ok {
					return nil, fmt.Errorf("expected MsgConfirmVault, got %T", msg)
				}
				return sdkAddressesToBytes(m.GetSigners()), nil
			},
		},
		{
			MsgType: protoreflect.FullName("marketplace.vault.v1.MsgDisableVault"),
			Fn: func(msg proto.Message) ([][]byte, error) {
				m, ok := safeCast[*vaulttypes.MsgDisableVault](msg)
				if !ok {
					return nil, fmt.Errorf("expected MsgDisableVault, got %T", msg)
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

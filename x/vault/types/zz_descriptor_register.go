package types

import (
	"bytes"
	"compress/gzip"
	"fmt"
	"io"

	gproto "google.golang.org/protobuf/proto"
	"google.golang.org/protobuf/reflect/protodesc"
	"google.golang.org/protobuf/reflect/protoregistry"
	"google.golang.org/protobuf/types/descriptorpb"

	msg "cosmossdk.io/api/cosmos/msg/v1"
)

// RegisterDescriptor registers the gzipped FileDescriptorProto in this package
// into the global protoregistry and sets the cosmos.msg.v1.service extension
// on the Msg service. Returns an error if registration fails.
func RegisterDescriptor() error {
	var gz = fileDescriptor_62733f43e31364a6

	r, err := gzip.NewReader(bytes.NewReader(gz))
	if err != nil {
		return fmt.Errorf("gzip reader: %w", err)
	}
	defer r.Close()
	raw, err := io.ReadAll(r)
	if err != nil {
		return fmt.Errorf("read gzip: %w", err)
	}

	var fdProto descriptorpb.FileDescriptorProto
	if err := gproto.Unmarshal(raw, &fdProto); err != nil {
		return fmt.Errorf("unmarshal fdproto: %w", err)
	}

	for i := range fdProto.Service {
		if fdProto.Service[i].GetName() == "Msg" {
			if fdProto.Service[i].Options == nil {
				fdProto.Service[i].Options = &descriptorpb.ServiceOptions{}
			}
			gproto.SetExtension(fdProto.Service[i].Options, msg.E_Service, true)
		}
	}

	// set signer options for messages that contain signer fields
	signerMsgs := map[string]struct{}{
		"MsgSetupVault":    {},
		"MsgConfirmVault":  {},
		"MsgUnlockAndSign": {},
		"MsgDisableVault":  {},
	}
	for i := range fdProto.MessageType {
		name := fdProto.MessageType[i].GetName()
		if _, ok := signerMsgs[name]; ok {
			if fdProto.MessageType[i].Options == nil {
				fdProto.MessageType[i].Options = &descriptorpb.MessageOptions{}
			}
			// signer is a repeated string option
			gproto.SetExtension(fdProto.MessageType[i].Options, msg.E_Signer, []string{"authority"})
		}
	}

	// clear dependencies that may not be present in the global registry
	fdProto.Dependency = nil

	f, err := protodesc.NewFile(&fdProto, protoregistry.GlobalFiles)
	if err != nil {
		return fmt.Errorf("protodesc.NewFile: %w", err)
	}
	if err := protoregistry.GlobalFiles.RegisterFile(f); err != nil {
		return fmt.Errorf("register file: %w", err)
	}
	return nil
}

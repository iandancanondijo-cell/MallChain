package main

import (
	"fmt"

	gproto "google.golang.org/protobuf/proto"
	"google.golang.org/protobuf/reflect/protodesc"
	"google.golang.org/protobuf/reflect/protoregistry"

	msg "cosmossdk.io/api/cosmos/msg/v1"
	types "marketplace/x/vault/types"
)

func main() {
	// try explicit registration and print errors
	if err := types.RegisterDescriptor(); err != nil {
		fmt.Printf("RegisterDescriptor error: %v\n", err)
	} else {
		fmt.Println("RegisterDescriptor succeeded")
	}

	path := "marketplace/vault/v1/tx.proto"
	f, err := protoregistry.GlobalFiles.FindFileByPath(path)
	if err != nil {
		fmt.Printf("FindFileByPath(%s) error: %v\n", path, err)
		return
	}

	fdProto := protodesc.ToFileDescriptorProto(f)
	if fdProto == nil {
		fmt.Println("ToFileDescriptorProto returned nil")
		return
	}

	for i := range fdProto.Service {
		s := fdProto.Service[i]
		name := s.GetName()
		fmt.Printf("service: %s\n", name)
		if s.Options == nil {
			fmt.Println("  Options: nil")
			continue
		}
		v := gproto.GetExtension(s.Options, msg.E_Service)
		if v == nil {
			fmt.Println("  cosmos.msg.v1.service extension not present")
		} else {
			fmt.Printf("  cosmos.msg.v1.service extension present: %v\n", v)
		}
	}

	for i := range fdProto.MessageType {
		m := fdProto.MessageType[i]
		fmt.Printf("message: %s\n", m.GetName())
		if m.Options == nil {
			fmt.Println("  Options: nil")
			continue
		}
		sv := gproto.GetExtension(m.Options, msg.E_Signer)
		if sv == nil {
			fmt.Println("  cosmos.msg.v1.signer not present")
		} else {
			fmt.Printf("  cosmos.msg.v1.signer: %v\n", sv)
		}
	}
}

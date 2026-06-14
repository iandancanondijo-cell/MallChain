package main

import (
	"fmt"
	"reflect"

	vaultkeeper "marketplace/x/vault/keeper"
	_ "marketplace/x/vault/module"
)

func main() {
	t := reflect.TypeOf((*vaultkeeper.Keeper)(nil))
	fmt.Println("vault keeper type:", t)
}

package main

import (
	"fmt"
	"reflect"

	authkeeper "github.com/cosmos/cosmos-sdk/x/auth/keeper"
	mltypes "marketplace/x/mlcoin/types"
)

func main() {
	var a *authkeeper.AccountKeeper
	var m *mltypes.AuthKeeper
	ta := reflect.TypeOf(a)
	tm := reflect.TypeOf(m)
	fmt.Println("authkeeper type:", ta)
	fmt.Println("mlcoin types.AuthKeeper type:", tm)
	fmt.Println("equal:", ta == tm)
}

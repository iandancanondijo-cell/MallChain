# mallchain-wasm-sdk - Python SDK for Mallchain Smart Contracts
#
# pip install mallchain-wasm-sdk
#
# Usage:
# from mallchain_wasm_sdk import WasmClient
# client = WasmClient('https://rpc.mallchain.com')
# code_id = client.store_code(wasm_bytes, sender)
# contract_addr = client.instantiate(code_id, init_msg, sender, label='my-contract')

from typing import Any, Optional
import json
import requests


class WasmClient:
    def __init__(self, rpc_url: str, chain_id: str = "mall-1"):
        self.rpc_url = rpc_url
        self.chain_id = chain_id

    def store_code(self, wasm_bytes: bytes, sender: str) -> int:
        """Store WASM bytecode and return code ID"""
        msg = {
            "type": "wasm/MsgStoreCode",
            "value": {
                "wasm_code": wasm_bytes.hex(),
                "sender": sender
            }
        }
        # Requires signing integration
        raise NotImplementedError("Requires CosmJS integration")

    def instantiate(
        self,
        code_id: int,
        init_msg: dict,
        sender: str,
        label: Optional[str] = None
    ) -> str:
        """Instantiate a WASM contract and return contract address"""
        msg = {
            "type": "wasm/MsgInstantiateContract",
            "value": {
                "code_id": code_id,
                "sender": sender,
                "label": label,
                "init_msg": init_msg
            }
        }
        raise NotImplementedError("Requires signing integration")

    def execute(
        self,
        contract_addr: str,
        msg: dict,
        sender: str,
        gas_limit: int = 200000
    ) -> dict:
        """Execute a WASM contract"""
        response = requests.post(
            f"{self.rpc_url}/wasm/execute/{contract_addr}",
            json={"msg": msg, "sender": sender, "gas_limit": gas_limit}
        )
        return response.json()

    def query(self, contract_addr: str, query: dict) -> Any:
        """Query a WASM contract"""
        response = requests.post(
            f"{self.rpc_url}/wasm/contract/{contract_addr}",
            json={"query": query}
        )
        return response.json()


# Example usage:
# client = WasmClient('https://rpc.mallchain.com')
# # code_id = client.store_code(wasm_buffer, signer_address)
# # contract_addr = client.instantiate(code_id, {'name': 'MyContract'}, signer_address, 'rewards')
# # result = client.execute(contract_addr, {'action': 'transfer', 'to': 'mall1...', 'amount': 100}, signer_address)
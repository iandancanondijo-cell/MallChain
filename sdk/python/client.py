# mallchain.client - Python SDK for Mallchain
#
# pip install mallchain-client
#
# Usage:
# from mallchain.client import MallchainClient
# client = MallchainClient('https://rpc.mallchain.com')
# status = client.get_status()
# block = client.get_block()

from typing import Any, Optional
import requests


class MallchainClient:
    def __init__(self, rpc_url: str, chain_id: str = "mall-1"):
        self.rpc_url = rpc_url.rstrip("/")
        self.chain_id = chain_id

    def query(self, path: str, params: Optional[dict] = None) -> Any:
        resp = requests.get(
            f"{self.rpc_url}{path}",
            params=params,
            headers={"Content-Type": "application/json"}
        )
        resp.raise_for_status()
        return resp.json()

    def get_status(self) -> Any:
        return self.query("/status")

    def get_block(self, height: Optional[int] = None) -> Any:
        path = f"/blocks/{height}" if height else "/blocks/latest"
        return self.query(path)

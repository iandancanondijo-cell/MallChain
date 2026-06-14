#!/usr/bin/env python3
"""
Test script: Generate Ed25519 keypair, sign a Mallcoin transfer, and send to chain
Requires: pip install cryptography requests
"""

import json
import requests
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from cryptography.hazmat.primitives import serialization

def main():
    # Generate Ed25519 keypair
    private_key = Ed25519PrivateKey.generate()
    public_key = private_key.public_key()
    
    # Export keys as hex
    private_bytes = private_key.private_bytes(
        encoding=serialization.Encoding.Raw,
        format=serialization.PrivateFormat.Raw,
        encryption_algorithm=serialization.NoEncryption()
    )
    public_bytes = public_key.public_bytes(
        encoding=serialization.Encoding.Raw,
        format=serialization.PublicFormat.Raw
    )
    
    private_hex = private_bytes.hex()
    public_hex = public_bytes.hex()
    
    print(f"Generated Ed25519 keypair:")
    print(f"Public key (hex):  {public_hex}")
    print(f"Private key (hex): {private_hex}")
    print()
    
    # Create transfer payload
    transfer_payload = {
        "creator": "cosmos1xyxyxyxyxyxyxyxyxyxyxyxyxyxyxyxyx0t0t0",
        "to": "cosmos1abababababababababababababababab1z1z1z",
        "amount": 100
    }
    
    # Canonical message bytes (JSON encoding)
    message_json = json.dumps(transfer_payload, separators=(',', ':'), sort_keys=True)
    message_bytes = message_json.encode('utf-8')
    
    print(f"Message to sign: {message_json}")
    print()
    
    # Sign the message
    signature_bytes = private_key.sign(message_bytes)
    signature_hex = signature_bytes.hex()
    
    print(f"Signature (hex): {signature_hex}")
    print()
    
    # Build the full message for the chain
    signed_transfer = {
        "creator": transfer_payload["creator"],
        "amount": str(transfer_payload["amount"]),
        "to": transfer_payload["to"],
        "signature": signature_hex,
        "public_key": public_hex
    }
    
    print("Signed transfer message:")
    print(json.dumps(signed_transfer, indent=2))
    print()
    
    # Send to chain REST API
    chain_rest_url = "http://127.0.0.1:1317"
    endpoint = f"{chain_rest_url}/marketplace/mlcoin/v1/transfer_mallcoin"
    
    print(f"Sending to {endpoint}...")
    
    try:
        response = requests.post(endpoint, json=signed_transfer, timeout=5)
        print(f"Status: {response.status_code}")
        print(f"Response: {response.text}")
    except requests.exceptions.RequestException as e:
        print(f"Request failed: {e}")
        print()
        print("Manual test command:")
        print(f"curl -X POST {endpoint} \\")
        print(f"  -H 'Content-Type: application/json' \\")
        print(f"  -d '{json.dumps(signed_transfer)}'")

if __name__ == "__main__":
    main()

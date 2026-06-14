#!/usr/bin/env python3
"""
Simple FX fetcher for exchangerate.host
- Fetches rates relative to KES and computes rate_to_kes (scaled by 100)
- Submits on-chain txs using `marketplaced tx mlcoin set-currency-rate` via subprocess

Configure via environment variables or edit the constants below.
"""

import os
import sys
import time
import json
import shutil
import subprocess
from typing import List

import requests

# Configuration
CURRENCIES = ["USD", "EUR", "GBP", "JPY", "KES"]  # add more ISO codes as needed
POLL_INTERVAL = int(os.getenv("FX_POLL_INTERVAL", "300"))  # seconds
CHAIN_ID = os.getenv("CHAIN_ID", "marketplace")
KEY_NAME = os.getenv("ORACLE_KEY", "oracle")
KEYRING_BACKEND = os.getenv("KEYRING_BACKEND", "test")
HOME = os.getenv("APP_HOME", os.path.expanduser("~/.marketplace"))
MARKETPLACED_BIN = shutil.which("marketplaced") or "marketplaced"

API_URL = "https://api.exchangerate.host/latest"

if not shutil.which(MARKETPLACED_BIN):
    print("Warning: marketplaced binary not found in PATH. Ensure it is installed.")


def fetch_rates(base: str = "KES", symbols: List[str] = None):
    params = {"base": base}
    if symbols:
        params["symbols"] = ",".join(symbols)
    resp = requests.get(API_URL, params=params, timeout=15)
    resp.raise_for_status()
    return resp.json()


def publish_rate(currency: str, rate_to_kes: int):
    # rate_to_kes is integer scaled by 100 (e.g., 13745 => 137.45 KES per 1 currency unit)
    cmd = [
        MARKETPLACED_BIN,
        "tx",
        "mlcoin",
        "set-currency-rate",
        KEY_NAME,
        currency,
        str(rate_to_kes),
        "--from",
        KEY_NAME,
        "--keyring-backend",
        KEYRING_BACKEND,
        "--chain-id",
        CHAIN_ID,
        "--home",
        HOME,
        "--yes",
        "--fees",
        "5000stake",
    ]
    print("Running:", " ".join(cmd))
    try:
        out = subprocess.run(cmd, check=True, capture_output=True, text=True)
        print("Published", currency, "->", rate_to_kes, "(output tx)")
        print(out.stdout)
    except subprocess.CalledProcessError as e:
        print("Failed to publish rate for", currency)
        print(e.stderr)


def main():
    # Ensure oracle key exists in keyring (user must create it beforehand)
    print("FX fetcher starting. Poll interval:", POLL_INTERVAL, "seconds")
    while True:
        try:
            # fetch rates with base KES so we get 1 KES -> X currency
            data = fetch_rates(base="KES", symbols=[c for c in CURRENCIES if c != "KES"])
            rates = data.get("rates", {})
            # For each currency (not KES), invert to get 1 currency -> KES
            for cur, val in rates.items():
                # val is how many units of currency equals 1 KES (since base=KES)
                # So 1 currency = 1/val KES
                if val == 0:
                    print("rate zero for", cur)
                    continue
                inverted = 1.0 / float(val)
                rate_to_kes = int(round(inverted * 100))
                print(f"{cur}: 1 {cur} = {inverted:.6f} KES -> scaled {rate_to_kes}")
                publish_rate(cur, rate_to_kes)
        except Exception as e:
            print("Error fetching/publishing rates:", e)
        time.sleep(POLL_INTERVAL)


if __name__ == "__main__":
    main()

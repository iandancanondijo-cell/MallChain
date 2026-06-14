# Transaction System Implementation Guide

**Purpose:** Complete implementation of blockchain transaction processing  
**Priority:** CRITICAL PATH  
**Estimated Time:** 8-12 hours  
**Date Created:** March 15, 2026

---

## Overview

This guide provides step-by-step instructions to enable full transaction processing on the Marketplace Blockchain platform, including:

1. Broadcasting transactions to the blockchain
2. Handling transaction confirmation
3. Recording transactions in the database
4. Displaying transaction status in the frontend
5. Error handling and recovery

---

## Architecture

```
Frontend (Send.jsx)
    ↓
API Route (/api/send/broadcast)
    ↓
Send Controller
    ↓
Blockchain TX Controller
    ↓
Cosmos Node (TCP)
    ↓
Blockchain Network
```

---

## Step 1: Setup Blockchain Connection

**File:** `backend/src/utils/cosmosClient.js` (Create if doesn't exist)

```javascript
const { SigningStargateClient } = require('@cosmjs/stargate');
const { DirectSecp256k1HdWallet } = require('@cosmjs/proto-signing');

let client = null;
let wallet = null;

const RPC_ENDPOINT = process.env.COSMOS_RPC_URL || 'http://localhost:26657';
const CHAIN_ID = process.env.COSMOS_CHAIN_ID || 'marketplace';
const GAS_PRICE = '0.025mln';

/**
 * Initialize Cosmos client with wallet
 * @param {string} mnemonic - Wallet mnemonic
 * @returns {Promise<Object>} - Client and wallet
 */
async function initializeClient(mnemonic) {
  try {
    wallet = await DirectSecp256k1HdWallet.fromMnemonic(
      mnemonic,
      {
        prefix: 'marketplace' // Match your chain prefix
      }
    );
    
    client = await SigningStargateClient.connectWithSigner(
      RPC_ENDPOINT,
      wallet,
      {
        gasPrice: GAS_PRICE,
        broadcastPollIntervalMs: 300,
        broadcastTimeoutMs: 10_000
      }
    );
    
    console.log('✓ Cosmos client initialized');
    return { client, wallet };
  } catch (error) {
    console.error('Failed to initialize Cosmos client:', error);
    throw error;
  }
}

/**
 * Get current client
 * @returns {Object} - Cosmos client
 */
function getClient() {
  if (!client) {
    throw new Error('Cosmos client not initialized. Call initializeClient first.');
  }
  return client;
}

/**
 * Get wallet
 * @returns {Object} - HD Wallet
 */
function getWallet() {
  if (!wallet) {
    throw new Error('Wallet not initialized');
  }
  return wallet;
}

module.exports = {
  initializeClient,
  getClient,
  getWallet,
  RPC_ENDPOINT,
  CHAIN_ID,
  GAS_PRICE
};
```

**File:** `backend/src/index.js` - Add initialization

```javascript
const { initializeClient } = require('./utils/cosmosClient');

// After express app setup
async function initializeBlockchain() {
  try {
    const mnemonic = process.env.OPERATOR_MNEMONIC;
    if (!mnemonic) {
      console.warn('⚠ OPERATOR_MNEMONIC not set - transactions disabled');
      return;
    }
    
    await initializeClient(mnemonic);
    console.log('✓ Blockchain initialized');
  } catch (error) {
    console.error('✗ Blockchain initialization failed:', error);
    process.exit(1);
  }
}

// Call before starting server
initializeBlockchain().then(() => {
  const PORT = process.env.PORT || 4000;
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
});
```

---

## Step 2: Implement Transaction Building

**File:** `backend/src/utils/transactionBuilder.js` (Create)

```javascript
const { MsgSend } = require('@cosmjs/stargate');
const { formatCoin } = require('@cosmjs/stargate');

/**
 * Build a simple send transaction
 * @param {Object} params - Transaction parameters
 * @returns {Object} - Transaction message
 */
function buildSendMessage({
  from,
  to,
  amount,
  denom = 'mln'
}) {
  return {
    typeUrl: '/cosmos.bank.v1beta1.MsgSend',
    value: MsgSend.fromPartial({
      fromAddress: from,
      toAddress: to,
      amount: [
        {
          denom,
          amount: amount.toString()
        }
      ]
    })
  };
}

/**
 * Estimate gas for transaction
 * @param {Object} params - Transaction parameters
 * @returns {number} - Estimated gas
 */
function estimateGas({ 
  messageCount = 1, 
  complexity = 'simple' 
} = {}) {
  const baseGas = 100_000;
  const perMessageGas = 50_000;
  
  let multiplier = 1;
  if (complexity === 'medium') multiplier = 2;
  if (complexity === 'complex') multiplier = 3;
  
  const estimated = (baseGas + (perMessageGas * messageCount)) * multiplier;
  
  // Add 30% buffer
  return Math.ceil(estimated * 1.3);
}

/**
 * Calculate transaction fee
 * @param {number} gas - Gas amount
 * @param {string} gasPrice - Price per gas unit (e.g., "0.025mln")
 * @returns {Object} - Fee information
 */
function calculateFee(gas, gasPrice = '0.025mln') {
  const [amount, denom] = gasPrice.split('mln');
  const feeAmount = Math.ceil(parseFloat(amount) * gas);
  
  return {
    amount: [
      {
        denom: 'mln',
        amount: feeAmount.toString()
      }
    ],
    gas: gas.toString()
  };
}

module.exports = {
  buildSendMessage,
  estimateGas,
  calculateFee
};
```

---

## Step 3: Enhanced Blockchain TX Controller

**File:** `backend/src/controllers/blockchainTxController.js` - Complete Implementation

```javascript
const { getClient, getWallet } = require('../utils/cosmosClient');
const { 
  buildSendMessage, 
  estimateGas, 
  calculateFee 
} = require('../utils/transactionBuilder');
const Transaction = require('../models/Transaction');

/**
 * Simulate transaction (dry run)
 */
exports.simulateTransaction = async (req, res) => {
  try {
    const { from, to, amount } = req.body;
    
    // Validate
    if (!from || !to || !amount) {
      return res.status(400).json({ 
        error: 'Missing required fields: from, to, amount' 
      });
    }
    
    const client = getClient();
    
    // Get account info
    const account = await client.getAccount(from);
    if (!account) {
      return res.status(404).json({ error: 'Account not found' });
    }
    
    // Build message
    const message = buildSendMessage({
      from,
      to,
      amount
    });
    
    // Estimate gas
    const gas = estimateGas({ messageCount: 1 });
    const fee = calculateFee(gas);
    
    // Calculate total cost
    const totalCost = parseInt(amount) + parseInt(fee.amount[0].amount);
    const balance = parseInt(
      account.balance?.amount || 0
    );
    
    if (balance < totalCost) {
      return res.status(400).json({
        error: 'Insufficient balance',
        required: totalCost,
        available: balance
      });
    }
    
    res.json({
      success: true,
      simulation: {
        from,
        to,
        amount,
        fee: fee.amount[0].amount,
        total: totalCost,
        gas,
        balance,
        canExecute: balance >= totalCost
      }
    });
  } catch (error) {
    console.error('Simulate error:', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Build and sign transaction
 */
exports.buildTransaction = async (req, res) => {
  try {
    const { from, to, amount, memo = '' } = req.body;
    
    if (!from || !to || !amount) {
      return res.status(400).json({ 
        error: 'Missing required fields' 
      });
    }
    
    const client = getClient();
    const wallet = getWallet();
    
    // Get account
    const account = await client.getAccount(from);
    if (!account) {
      return res.status(404).json({ error: 'Account not found' });
    }
    
    // Build message
    const message = buildSendMessage({
      from,
      to,
      amount
    });
    
    // Estimate gas & fee
    const gas = estimateGas();
    const fee = calculateFee(gas);
    
    // Sign transaction
    const signed = await client.sign(
      from,
      [message],
      fee,
      memo
    );
    
    res.json({
      success: true,
      tx: signed,
      txBytes: Buffer.from(signed).toString('base64')
    });
  } catch (error) {
    console.error('Build transaction error:', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Broadcast transaction
 */
exports.broadcastTransaction = async (req, res) => {
  try {
    const { txBytes, from, to, amount } = req.body;
    
    if (!txBytes) {
      return res.status(400).json({ error: 'Missing txBytes' });
    }
    
    const client = getClient();
    
    // Decode if needed
    let tx = txBytes;
    if (typeof txBytes === 'string') {
      tx = Uint8Array.from(Buffer.from(txBytes, 'base64'));
    }
    
    console.log('Broadcasting transaction...');
    
    // Broadcast with retry logic
    let result;
    let attempts = 0;
    const maxAttempts = 3;
    
    while (attempts < maxAttempts) {
      try {
        result = await client.broadcastTx(tx);
        
        if (result.code === undefined || result.code === 0) {
          break; // Success
        }
        
        attempts++;
        if (attempts < maxAttempts) {
          await new Promise(r => setTimeout(r, 1000));
        }
      } catch (error) {
        attempts++;
        if (attempts >= maxAttempts) throw error;
        await new Promise(r => setTimeout(r, 2000));
      }
    }
    
    // Check if transaction failed
    if (result.code !== undefined && result.code !== 0) {
      console.error('Transaction failed:', result);
      return res.status(400).json({
        error: 'Transaction failed',
        code: result.code,
        log: result.log
      });
    }
    
    const txHash = result.hash || result.transactionHash;
    console.log(`✓ Transaction broadcast: ${txHash}`);
    
    // Record in database
    if (from && to) {
      try {
        await Transaction.create({
          from,
          to,
          amount,
          txHash,
          status: 'pending',
          broadcastTime: new Date()
        });
      } catch (dbError) {
        console.warn('Failed to record transaction:', dbError);
      }
    }
    
    res.json({
      success: true,
      txHash,
      status: 'pending'
    });
  } catch (error) {
    console.error('Broadcast error:', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Get transaction status
 */
exports.getTransactionStatus = async (req, res) => {
  try {
    const { txHash } = req.params;
    
    if (!txHash) {
      return res.status(400).json({ error: 'Missing txHash' });
    }
    
    const client = getClient();
    
    // Query blockchain
    let txResult;
    try {
      txResult = await client.getTx(txHash);
    } catch (error) {
      // Not found yet, might still be pending
      txResult = null;
    }
    
    // Check database
    const dbTx = await Transaction.findOne({ txHash });
    
    if (txResult) {
      // Update database
      if (dbTx) {
        dbTx.status = txResult.code === 0 ? 'confirmed' : 'failed';
        dbTx.confirmTime = new Date();
        await dbTx.save();
      }
      
      return res.json({
        success: true,
        status: txResult.code === 0 ? 'confirmed' : 'failed',
        height: txResult.height,
        gasUsed: txResult.gasUsed,
        gasWanted: txResult.gasWanted,
        code: txResult.code,
        log: txResult.log
      });
    }
    
    if (dbTx) {
      return res.json({
        success: true,
        status: dbTx.status,
        broadcastTime: dbTx.broadcastTime
      });
    }
    
    res.status(404).json({ 
      error: 'Transaction not found',
      txHash 
    });
  } catch (error) {
    console.error('Get transaction status error:', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Get account balance
 */
exports.getAccountBalance = async (req, res) => {
  try {
    const { address } = req.params;
    
    if (!address) {
      return res.status(400).json({ error: 'Missing address' });
    }
    
    const client = getClient();
    const account = await client.getAccount(address);
    
    if (!account) {
      return res.json({
        success: true,
        address,
        balance: 0
      });
    }
    
    const balance = account.balance?.amount || '0';
    
    res.json({
      success: true,
      address,
      balance: parseInt(balance),
      balanceFormatted: `${parseInt(balance) / 1_000_000} MLN`
    });
  } catch (error) {
    console.error('Get balance error:', error);
    res.status(500).json({ error: error.message });
  }
};
```

---

## Step 4: Complete Send Controller

**File:** `backend/src/controllers/sendController.js` - Full Implementation

```javascript
const { getClient } = require('../utils/cosmosClient');
const { buildSendMessage, estimateGas, calculateFee } = require('../utils/transactionBuilder');
const Transaction = require('../models/Transaction');

/**
 * Send transaction endpoint
 * Full flow: validate → simulate → sign → broadcast
 */
exports.sendTransaction = async (req, res) => {
  try {
    const { to, amount, memo = '' } = req.body;
    const from = req.user?.walletAddress;
    
    // Validate input
    if (!from || !to || !amount) {
      return res.status(400).json({
        error: 'Missing required fields',
        required: ['to', 'amount']
      });
    }
    
    if (amount <= 0) {
      return res.status(400).json({ error: 'Amount must be positive' });
    }
    
    if (from === to) {
      return res.status(400).json({ error: 'Cannot send to self' });
    }
    
    const client = getClient();
    
    // Check sender account
    const sender = await client.getAccount(from);
    if (!sender) {
      return res.status(404).json({ error: 'Sender account not found' });
    }
    
    // Check recipient account exists
    const recipient = await client.getAccount(to);
    if (!recipient) {
      return res.status(404).json({ error: 'Recipient account not found' });
    }
    
    // Build message
    const message = buildSendMessage({ from, to, amount });
    
    // Estimate gas
    const gas = estimateGas();
    const fee = calculateFee(gas);
    
    // Check balance
    const senderBalance = parseInt(sender.balance?.amount || 0);
    const totalCost = amount + parseInt(fee.amount[0].amount);
    
    if (senderBalance < totalCost) {
      return res.status(400).json({
        error: 'Insufficient balance',
        required: totalCost,
        available: senderBalance,
        amount,
        fee: parseInt(fee.amount[0].amount)
      });
    }
    
    // Sign and broadcast
    const signed = await client.sign(from, [message], fee, memo);
    const result = await client.broadcastTx(signed);
    
    if (result.code !== undefined && result.code !== 0) {
      return res.status(400).json({
        error: 'Transaction failed',
        code: result.code,
        log: result.log
      });
    }
    
    const txHash = result.hash;
    
    // Record transaction
    const transaction = await Transaction.create({
      from,
      to,
      amount,
      txHash,
      memo,
      status: 'pending',
      fee: parseInt(fee.amount[0].amount),
      gas,
      broadcastTime: new Date()
    });
    
    res.json({
      success: true,
      txHash,
      transactionId: transaction._id,
      status: 'pending',
      amount,
      fee: parseInt(fee.amount[0].amount),
      total: totalCost
    });
  } catch (error) {
    console.error('Send transaction error:', error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Simulate send (no actual broadcast)
 */
exports.simulateSend = async (req, res) => {
  try {
    const { to, amount } = req.body;
    const from = req.user?.walletAddress;
    
    if (!from || !to || !amount) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    const client = getClient();
    const sender = await client.getAccount(from);
    
    if (!sender) {
      return res.status(404).json({ error: 'Account not found' });
    }
    
    const gas = estimateGas();
    const fee = calculateFee(gas);
    const feeAmount = parseInt(fee.amount[0].amount);
    const totalCost = amount + feeAmount;
    const balance = parseInt(sender.balance?.amount || 0);
    
    res.json({
      success: true,
      simulation: {
        amount,
        fee: feeAmount,
        total: totalCost,
        gas,
        balance,
        canExecute: balance >= totalCost,
        balanceAfter: Math.max(0, balance - totalCost)
      }
    });
  } catch (error) {
    console.error('Simulate send error:', error);
    res.status(500).json({ error: error.message });
  }
};
```

---

## Step 5: Database Model

**File:** `backend/src/models/Transaction.js` (Create if doesn't exist)

```javascript
const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
  // Addresses
  from: {
    type: String,
    required: true,
    index: true
  },
  to: {
    type: String,
    required: true,
    index: true
  },
  
  // Amount
  amount: {
    type: Number,
    required: true
  },
  fee: {
    type: Number,
    default: 0
  },
  
  // Transaction details
  txHash: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  memo: {
    type: String,
    default: ''
  },
  
  // Status tracking
  status: {
    type: String,
    enum: ['pending', 'confirmed', 'failed'],
    default: 'pending',
    index: true
  },
  
  // Gas information
  gas: Number,
  gasUsed: Number,
  
  // Timestamps
  broadcastTime: {
    type: Date,
    default: () => new Date()
  },
  confirmTime: Date,
  
  // Block information
  height: Number,
  
  // Error tracking
  error: String,
  errorLog: String,
  
  // Retry logic
  retryCount: {
    type: Number,
    default: 0
  },
  maxRetries: {
    type: Number,
    default: 3
  }
});

// Indexes for queries
transactionSchema.index({ from: 1, broadcastTime: -1 });
transactionSchema.index({ to: 1, broadcastTime: -1 });
transactionSchema.index({ status: 1, broadcastTime: -1 });

module.exports = mongoose.model('Transaction', transactionSchema);
```

---

## Step 6: API Routes

**File:** `backend/src/routes/tx.js` - Complete Routes

```javascript
const express = require('express');
const blockchainTxController = require('../controllers/blockchainTxController');
const sendController = require('../controllers/sendController');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// Protected routes (require authentication)
router.post('/send', authenticate, sendController.sendTransaction);
router.post('/simulate', authenticate, sendController.simulateSend);

// Public routes
router.get('/status/:txHash', blockchainTxController.getTransactionStatus);
router.get('/balance/:address', blockchainTxController.getAccountBalance);

// Advanced routes
router.post('/broadcast', authenticate, blockchainTxController.broadcastTransaction);
router.post('/simulate-blockchain', authenticate, blockchainTxController.simulateTransaction);
router.post('/build', authenticate, blockchainTxController.buildTransaction);

module.exports = router;
```

---

## Step 7: Frontend Send Page

**File:** `frontend/src/pages/Send.jsx` - Complete Implementation

```jsx
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mail, ArrowRight, Zap, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import '../pages/Auth/Register.css'; // Reuse styling

export default function Send() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    to: '',
    amount: '',
    memo: ''
  });
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [simulation, setSimulation] = useState(null);
  const [result, setResult] = useState(null);
  const [focusedField, setFocusedField] = useState(null);

  // Validate form
  const validateForm = () => {
    const newErrors = {};
    
    if (!form.to.trim()) newErrors.to = 'Recipient address required';
    else if (form.to.length < 40) newErrors.to = 'Invalid address format';
    
    if (!form.amount) newErrors.amount = 'Amount required';
    else if (form.amount <= 0) newErrors.amount = 'Amount must be positive';
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Simulate transaction
  const handleSimulate = async () => {
    if (!validateForm()) return;
    
    try {
      const response = await fetch('/api/tx/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: form.to,
          amount: parseInt(form.amount)
        })
      });
      
      const data = await response.json();
      if (data.success) {
        setSimulation(data.simulation);
      }
    } catch (error) {
      toast.error('Failed to simulate transaction');
    }
  };

  // Send transaction
  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!validateForm()) {
      toast.error('Please fix form errors');
      return;
    }
    
    setLoading(true);
    
    try {
      const response = await fetch('/api/tx/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: form.to,
          amount: parseInt(form.amount),
          memo: form.memo
        })
      });
      
      const data = await response.json();
      
      if (!data.success) {
        throw new Error(data.error || 'Transaction failed');
      }
      
      setResult({
        success: true,
        txHash: data.txHash,
        amount: data.amount,
        fee: data.fee,
        total: data.total
      });
      
      toast.success(`Transaction sent: ${data.txHash.slice(0, 16)}...`);
      
      // Redirect after 3 seconds
      setTimeout(() => {
        navigate(`/transaction/${data.txHash}`);
      }, 3000);
    } catch (error) {
      setResult({
        success: false,
        error: error.message
      });
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm({ ...form, [name]: value });
    if (errors[name]) {
      setErrors({ ...errors, [name]: '' });
    }
    setSimulation(null);
  };

  return (
    <div className="register-container">
      <div className="floating-orb orb-1"></div>
      <div className="floating-orb orb-2"></div>
      <div className="floating-orb orb-3"></div>
      
      <div className="register-form-wrapper">
        <div className="register-header">
          <div className="icon-circle">
            <ArrowRight size={40} />
          </div>
          <h1>Send Transaction</h1>
          <p>Transfer Mallcoins securely</p>
        </div>

        {result?.success ? (
          <div className="success-card">
            <ShieldCheck size={48} />
            <h2>Transaction Submitted</h2>
            <p>Hash: {result.txHash}</p>
            <div className="tx-details">
              <div>Amount: {result.amount} MLN</div>
              <div>Fee: {result.fee} MLN</div>
              <div>Total: {result.total} MLN</div>
            </div>
            <p className="redirecting">Redirecting...</p>
          </div>
        ) : result?.success === false ? (
          <div className="error-card">
            <p>Error: {result.error}</p>
            <button onClick={() => setResult(null)}>Try Again</button>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="form-grid">
              <div>
                <label>Recipient Address</label>
                <textarea
                  name="to"
                  value={form.to}
                  onChange={handleChange}
                  onFocus={() => setFocusedField('to')}
                  onBlur={() => setFocusedField(null)}
                  placeholder="marketplace1ABC..."
                  rows="3"
                  className={errors.to ? 'error' : ''}
                />
                {errors.to && <span className="error-text">{errors.to}</span>}
              </div>

              <div>
                <label>Amount (MLN)</label>
                <input
                  type="number"
                  name="amount"
                  value={form.amount}
                  onChange={handleChange}
                  onFocus={() => setFocusedField('amount')}
                  onBlur={() => setFocusedField(null)}
                  placeholder="0"
                  min="0"
                  className={errors.amount ? 'error' : ''}
                />
                {errors.amount && <span className="error-text">{errors.amount}</span>}
              </div>
            </div>

            <div>
              <label>Memo (Optional)</label>
              <textarea
                name="memo"
                value={form.memo}
                onChange={handleChange}
                placeholder="Add a note for this transaction"
                rows="2"
              />
            </div>

            {simulation && (
              <div className="simulation-card">
                <h3>Transaction Summary</h3>
                <div className="sim-row">
                  <span>Amount:</span>
                  <span>{simulation.amount} MLN</span>
                </div>
                <div className="sim-row">
                  <span>Gas Fee:</span>
                  <span>{simulation.fee} MLN</span>
                </div>
                <div className="sim-row">
                  <span>Total Cost:</span>
                  <span className="total">{simulation.total} MLN</span>
                </div>
                <div className="sim-row">
                  <span>Balance After:</span>
                  <span>{simulation.balanceAfter} MLN</span>
                </div>
                {!simulation.canExecute && (
                  <p className="warning">⚠ Insufficient balance</p>
                )}
              </div>
            )}

            <div className="form-actions">
              <button
                type="button"
                onClick={handleSimulate}
                className="btn-secondary"
                disabled={loading}
              >
                <Zap size={18} />
                Simulate
              </button>
              <button
                type="submit"
                className="btn-submit"
                disabled={loading || !simulation?.canExecute}
              >
                {loading ? 'Sending...' : 'Send'}
                <ArrowRight size={18} />
              </button>
            </div>
          </form>
        )}

        <div className="register-footer">
          <div className="badge">
            <ShieldCheck size={14} />
            Transactions Encrypted
          </div>
          <div className="badge">
            <Zap size={14} />
            Gas Fee Included
          </div>
        </div>
      </div>
    </div>
  );
}
```

---

## Step 8: Environment Variables

**.env file additions:**

```bash
# Blockchain
COSMOS_RPC_URL=http://localhost:26657
COSMOS_CHAIN_ID=marketplace
OPERATOR_MNEMONIC=your_operator_mnemonic_here
GAS_PRICE=0.025mln

# Transaction Settings
TX_TIMEOUT=30000
TX_BROADCAST_TIMEOUT=10000
TX_POLL_INTERVAL=300
```

---

## Step 9: Testing

### 1. Unit Tests - Transaction Builder

```javascript
// test/transactionBuilder.test.js
const { estimateGas, calculateFee } = require('../src/utils/transactionBuilder');

describe('Transaction Builder', () => {
  test('should estimate gas correctly', () => {
    const gas = estimateGas({ messageCount: 1, complexity: 'simple' });
    expect(gas).toBeGreaterThan(100000);
  });
  
  test('should calculate fee correctly', () => {
    const fee = calculateFee(150000, '0.025mln');
    expect(fee.amount[0].amount).toBe('3750');
  });
});
```

### 2. Integration Test - Send Transaction

```bash
# Test send endpoint
curl -X POST http://localhost:4000/api/tx/send \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "to": "marketplace1ABC...",
    "amount": 100,
    "memo": "test"
  }'
```

### 3. Manual Testing Checklist

- [ ] Send 1 MLN
- [ ] Verify transaction appears in history
- [ ] Check blockchain explorer
- [ ] Verify balance updated
- [ ] Test insufficient balance
- [ ] Test invalid address
- [ ] Test zero amount
- [ ] Verify gas fees calculated correctly
- [ ] Test transaction with memo
- [ ] Verify no console errors

---

## Deployment Checklist

- [ ] Environment variables set
- [ ] Database connected
- [ ] Blockchain node running
- [ ] Wallet imported (operator mnemonic)
- [ ] API routes registered
- [ ] Middleware configured
- [ ] Error logging enabled
- [ ] Frontend deployed
- [ ] SSL certificates valid
- [ ] Rate limiting configured
- [ ] Monitoring active

---

**Next:** Once transactions are working, proceed to Payment Processing (PRIORITY 1.2).

#!/usr/bin/env node
// Simple operator HTTP server that uses the local `marketplaced` CLI to send mlc
// Usage: set env OPERATOR_KEY (key name in keyring), MARKETPLACED_PATH (path to binary)
// and run: node operator_server.js
const http = require('http')
const { spawn } = require('child_process')
const PORT = process.env.OPERATOR_PORT || 8081
const MARKETPLACED = process.env.MARKETPLACED_PATH || './build/marketplaced'
const OPERATOR_KEY = process.env.OPERATOR_KEY || 'operator'
const HOME = process.env.MARKETPLACE_HOME || 'marketplace/build/node1'

function runSend(recipient, amount, cb){
  // amount like "1000mlc"
  const args = ['tx','bank','send', OPERATOR_KEY, recipient, amount, '--chain-id','testing-1','--home', HOME, '--keyring-backend','test','-y']
  const p = spawn(MARKETPLACED, args)
  let out = ''
  let err = ''
  p.stdout.on('data', d=> out += d.toString())
  p.stderr.on('data', d=> err += d.toString())
  p.on('close', code => cb(code, out, err))
}

const server = http.createServer((req, res) => {
  if(req.method === 'POST' && req.url === '/fund'){
    let body = ''
    req.on('data', chunk => body += chunk)
    req.on('end', ()=>{
      try{
        const j = JSON.parse(body)
        const recipient = j.address
        const amount = j.amount || '1000mlc'
        if(!recipient){ res.writeHead(400); res.end('missing address'); return }
        runSend(recipient, amount, (code, out, err)=>{
          if(code === 0){ res.writeHead(200, {'Content-Type':'application/json'}); res.end(JSON.stringify({ ok:true, out })) }
          else { res.writeHead(500, {'Content-Type':'application/json'}); res.end(JSON.stringify({ ok:false, code, out, err })) }
        })
      }catch(e){ res.writeHead(400); res.end('invalid json') }
    })
    return
  }
  res.writeHead(404); res.end('not found')
})

server.listen(PORT, ()=> console.log('operator server listening on', PORT))

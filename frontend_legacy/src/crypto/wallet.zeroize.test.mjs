import assert from 'assert'
import { zeroizeUint8Array } from './wallet.js'

function run() {
  console.log('Zeroize test')
  const arr = new Uint8Array([1,2,3,4,5])
  zeroizeUint8Array(arr)
  for (let i=0;i<arr.length;i++) assert(arr[i] === 0, 'byte zeroized')
  console.log('Zeroize OK')
}

run()

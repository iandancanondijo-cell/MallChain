(module
  (memory (export "memory") 2)
  (func (export "allocate") (param $size i32) (result i32) (i32.const 1024))
  (func (export "_instantiate") (param $msg_ptr i32) (param $msg_len i32) (result i32) (i32.const 0))

  ;; Calls a no-op function in a tight, effectively-unbounded loop. Real gas
  ;; metering must abort this well before it would ever return on its own —
  ;; if it doesn't, the module can hold a validator's CPU hostage regardless
  ;; of how much gas was nominally charged.
  (func $noop)
  (func (export "_execute") (param $msg_ptr i32) (param $msg_len i32) (result i32)
    (local $i i64)
    (local.set $i (i64.const 0))
    (block $done
      (loop $again
        (call $noop)
        (local.set $i (i64.add (local.get $i) (i64.const 1)))
        (br_if $done (i64.ge_s (local.get $i) (i64.const 100000000000)))
        (br $again)
      )
    )
    (i32.const 0)
  )
)

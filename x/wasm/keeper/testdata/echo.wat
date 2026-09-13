(module
  (import "env" "db_write" (func $db_write (param i32 i32 i32 i32)))
  (import "env" "db_read" (func $db_read (param i32 i32) (result i32)))
  (memory (export "memory") 2)
  (global $next_free (mut i32) (i32.const 2048))

  (func (export "allocate") (param $size i32) (result i32)
    (local $ptr i32)
    (local.set $ptr (global.get $next_free))
    (global.set $next_free (i32.add (global.get $next_free) (local.get $size)))
    (local.get $ptr)
  )

  (func (export "_instantiate") (param $msg_ptr i32) (param $msg_len i32) (result i32) (i32.const 0))

  ;; Round-trips the input message through real host storage: writes it
  ;; under key "k", reads it back, and returns whatever comes back — proving
  ;; the memory bridge AND the host storage functions both work end-to-end,
  ;; not just that some hardcoded success value is returned.
  (func (export "_execute") (param $msg_ptr i32) (param $msg_len i32) (result i32)
    (i32.store8 (i32.const 0) (i32.const 107)) ;; 'k' at offset 0
    (call $db_write (i32.const 0) (i32.const 1) (local.get $msg_ptr) (local.get $msg_len))
    (call $db_read (i32.const 0) (i32.const 1))
  )
)

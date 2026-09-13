(module
  (memory (export "memory") 2)
  ;; Exports _instantiate but deliberately no allocate — the VM must fail
  ;; clearly rather than silently skip delivering input.
  (func (export "_instantiate") (param $msg_ptr i32) (param $msg_len i32) (result i32) (i32.const 0))
)

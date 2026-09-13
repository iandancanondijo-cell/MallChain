(module
  (memory (export "memory") 2)
  (data (i32.const 8) "\10\00\00\00{\22success\22:true}")

  (func (export "allocate") (param $size i32) (result i32) (i32.const 4096))
  (func (export "_instantiate") (param $msg_ptr i32) (param $msg_len i32) (result i32) (i32.const 0))
  (func (export "_execute") (param $msg_ptr i32) (param $msg_len i32) (result i32) (i32.const 8))
  (func (export "_query") (param $msg_ptr i32) (param $msg_len i32) (result i32) (i32.const 0))
)

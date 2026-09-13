package types

import "cosmossdk.io/collections"

// DocumentRecordKey is the prefix to retrieve all DocumentRecord, keyed by record_id.
var DocumentRecordKey = collections.NewPrefix("documentRecord/value/")

// RecordSeqKey is the prefix for the record-id-generating sequence.
var RecordSeqKey = collections.NewPrefix("documentRecord/seq/")

// DocVersionIndexKey is the prefix for the (doc_id, version) -> record_id index
// used to walk a document's version history in order.
var DocVersionIndexKey = collections.NewPrefix("documentRecord/versionIndex/")

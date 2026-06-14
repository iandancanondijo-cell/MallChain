package keeper

// ContractTemplate represents a minimal WASM contract structure
type ContractTemplate struct {
	Name    string `json:"name"`
	Version string `json:"version"`
	ABI     string `json:"abi"`
}

// TemplateRegistry holds contract templates for instantiation
type TemplateRegistry struct {
	templates map[string]ContractTemplate
}

// NewTemplateRegistry creates a new template registry
func NewTemplateRegistry() *TemplateRegistry {
	return &TemplateRegistry{
		templates: map[string]ContractTemplate{
			"counter":       {Name: "counter", Version: "1.0.0", ABI: "mallchain"},
			"mgp20-callback": {Name: "mgp20-callback", Version: "1.0.0", ABI: "mallchain"},
			"dao-voting":    {Name: "dao-voting", Version: "1.0.0", ABI: "mallchain"},
			"nft-minter":    {Name: "nft-minter", Version: "1.0.0", ABI: "mallchain"},
		},
	}
}

// GetTemplate returns a contract template by name
func (r *TemplateRegistry) GetTemplate(name string) (ContractTemplate, bool) {
	t, ok := r.templates[name]
	return t, ok
}
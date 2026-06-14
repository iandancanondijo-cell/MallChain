use cosmwasm_std::{
    to_binary, Coin, CosmosMsg, WasmMsg, QuerierWrapper, QueryRequest,
    BalanceResponse, AllowanceResponse, StdResult, StdError,
};

pub const MGP20_TRANSFER: &str = "mgp20_transfer";
pub const MGP20_APPROVE: &str = "mgp20_approve";
pub const MGP20_TRANSFER_FROM: &str = "mgp20_transfer_from";

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug, PartialEq)]
pub struct Transfer {
    pub from: String,
    pub to: String,
    pub amount: Uint256,
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug, PartialEq)]
pub struct Approve {
    pub owner: String,
    pub spender: String,
    pub amount: Uint256,
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug, PartialEq)]
pub struct TransferFrom {
    pub owner: String,
    pub spender: String,
    pub recipient: String,
    pub amount: Uint256,
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug, PartialEq)]
pub struct BalanceQuery {
    pub address: String,
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug, PartialEq)]
pub struct AllowanceQuery {
    pub owner: String,
    pub spender: String,
}

pub fn transfer_mgp20(from: String, to: String, amount: Uint256) -> CosmosMsg {
    CosmosMsg::Custom(Transfer { from, to, amount })
}

pub fn approve_mgp20(owner: String, spender: String, amount: Uint256) -> CosmosMsg {
    CosmosMsg::Custom(Approve { owner, spender, amount })
}

pub fn transfer_from_mgp20(
    owner: String,
    spender: String,
    recipient: String,
    amount: Uint256,
) -> CosmosMsg {
    CosmosMsg::Custom(TransferFrom {
        owner,
        spender,
        recipient,
        amount,
    })
}

pub fn query_balance(querier: &QuerierWrapper, address: &str) -> StdResult<Uint256> {
    let query = BalanceQuery { address: address.to_string() };
    let request: QueryRequest<BalanceQuery> = QueryRequest::Custom(query);
    let response: BalanceResponse = querier.query(&to_binary(&request)?)?;
    Ok(response.balance)
}
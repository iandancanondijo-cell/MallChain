use cosmwasm_std::{
    entry_point, to_binary, Binary, Deps, DepsMut, Env, MessageInfo,
    Response, StdResult, StdError, CosmosMsg,
};
use cosmwasm_schema::JsonSchema;
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, JsonSchema)]
pub struct InstantiateMsg {
    pub name: String,
    pub symbol: String,
    pub decimals: u8,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, JsonSchema)]
pub struct ExecuteMsg {
    #[serde(rename = "transfer")]
    pub transfer: Option<TransferMsg>,
    #[serde(rename = "approve")]
    pub approve: Option<ApproveMsg>,
    #[serde(rename = "transfer_from")]
    pub transfer_from: Option<TransferFromMsg>,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, JsonSchema)]
pub struct TransferMsg {
    pub to: String,
    pub amount: String,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, JsonSchema)]
pub struct ApproveMsg {
    pub spender: String,
    pub amount: String,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, JsonSchema)]
pub struct TransferFromMsg {
    pub owner: String,
    pub recipient: String,
    pub amount: String,
}

#[entry_point]
pub fn instantiate(
    _deps: DepsMut,
    _env: Env,
    _info: MessageInfo,
    _msg: InstantiateMsg,
) -> StdResult<Response> {
    Ok(Response::new()
        .add_attribute("action", "instantiate")
        .add_attribute("method", "mgp20_token"))
}

#[entry_point]
pub fn execute(
    deps: DepsMut,
    env: Env,
    info: MessageInfo,
    msg: ExecuteMsg,
) -> StdResult<Response> {
    match msg.transfer {
        Some(transfer) => execute_transfer(deps, env, info, transfer),
        None => match msg.approve {
            Some(approve) => execute_approve(deps, env, info, approve),
            None => match msg.transfer_from {
                Some(transfer_from) => execute_transfer_from(deps, env, info, transfer_from),
                None => Err(StdError::generic_err("unknown message")),
            },
        },
    }
}

pub fn execute_transfer(
    _deps: DepsMut,
    _env: Env,
    info: MessageInfo,
    msg: TransferMsg,
) -> StdResult<Response> {
    Ok(Response::new()
        .add_message(CosmosMsg::Custom(TransferMsg {
            to: msg.to,
            amount: msg.amount,
        }))
        .add_attribute("action", "transfer")
        .add_attribute("sender", info.sender))
}

pub fn execute_approve(
    _deps: DepsMut,
    _env: Env,
    info: MessageInfo,
    msg: ApproveMsg,
) -> StdResult<Response> {
    Ok(Response::new()
        .add_message(CosmosMsg::Custom(ApproveMsg {
            spender: msg.spender,
            amount: msg.amount,
        }))
        .add_attribute("action", "approve")
        .add_attribute("owner", info.sender))
}

pub fn execute_transfer_from(
    _deps: DepsMut,
    _env: Env,
    info: MessageInfo,
    msg: TransferFromMsg,
) -> StdResult<Response> {
    Ok(Response::new()
        .add_message(CosmosMsg::Custom(TransferFromMsg {
            owner: msg.owner,
            recipient: msg.recipient,
            amount: msg.amount,
        }))
        .add_attribute("action", "transfer_from")
        .add_attribute("spender", info.sender))
}
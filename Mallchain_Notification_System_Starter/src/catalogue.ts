import type { Channel, Severity } from "./types.js";

export interface TemplateDefinition {
  id: string;
  version: number;
  eventType: string;
  category: string;
  severity: Severity;
  channels: Channel[];
  required: string[];
  title: string;
  subject?: string;
  body: string;
  transactional: boolean;
}

const t = (
  id: string, eventType: string, category: string, severity: Severity,
  required: string[], title: string, body: string,
  channels: Channel[] = ["in_app", "email"], subject?: string
): TemplateDefinition => ({
  id, version: 1, eventType, category, severity, required, title, body,
  channels, ...(subject ? {subject} : {}), transactional: true
});

export const templates: TemplateDefinition[] = [
  t("account.welcome", "account.created", "account", "success", [], "Welcome to Mallchain",
    "Your account has been created successfully. Explore Mallchain and The Market Place. Keep your password, private keys, recovery phrase, and verification codes confidential.",
    ["in_app","email"], "Welcome to Mallchain"),
  t("account.email-verification", "account.email_verification_requested", "security", "warning", ["otp_code","expiry_minutes"], "Verify your email address",
    "Your verification code is {{otp_code}}. It expires in {{expiry_minutes}} minutes. Never share this code with anyone.",
    ["email"], "Verify your Mallchain email"),
  t("account.email-verified", "account.email_verified", "account", "success", [], "Email verified",
    "Your email address has been verified successfully. You can continue setting up your Mallchain account."),
  t("account.new-login", "account.new_login", "security", "warning", ["event_time","device_name"], "New sign-in detected",
    "A sign-in was detected at {{event_time}} from {{device_name}}. If you do not recognize this activity, secure your account.",
    ["in_app","email","push"], "New sign-in to Mallchain"),
  t("account.password-changed", "account.password_changed", "security", "warning", [], "Password changed",
    "Your Mallchain password was changed. If you did not make this change, secure your account immediately.",
    ["in_app","email","push"], "Your Mallchain password changed"),
  t("wallet.created", "wallet.created", "wallet", "success", ["wallet_address_short","network_name"], "Wallet created",
    "Your Mallchain wallet has been created. Wallet: {{wallet_address_short}}. Network: {{network_name}}. Keep your private keys and recovery phrase confidential."),
  t("wallet.deposit-detected", "wallet.deposit_detected", "wallet", "info", ["amount","asset","tx_hash_short"], "Incoming transfer detected",
    "An incoming transfer of {{amount}} {{asset}} has been detected and is awaiting confirmation. Reference: {{tx_hash_short}}.",
    ["in_app","email","push"], "Mallchain deposit detected"),
  t("wallet.deposit-confirmed", "wallet.deposit_confirmed", "wallet", "success", ["amount","asset","available_balance","tx_hash_short"], "Deposit confirmed",
    "Your deposit of {{amount}} {{asset}} has been confirmed and credited. Available balance: {{available_balance}} {{asset}}. Reference: {{tx_hash_short}}.",
    ["in_app","email","push"], "Mallchain deposit confirmed"),
  t("wallet.withdrawal-requested", "wallet.withdrawal_requested", "wallet", "warning", ["amount","asset","destination_short","reference_id"], "Withdrawal requested",
    "Your withdrawal request for {{amount}} {{asset}} to {{destination_short}} was received. Status: pending verification. Reference: {{reference_id}}.",
    ["in_app","email","push"], "Mallchain withdrawal requested"),
  t("wallet.withdrawal-failed", "wallet.withdrawal_failed", "wallet", "warning", ["amount","asset","user_safe_reason","reference_id"], "Withdrawal not completed",
    "Your withdrawal of {{amount}} {{asset}} could not be completed. Reason: {{user_safe_reason}}. Reference: {{reference_id}}.",
    ["in_app","email","push"], "Mallchain withdrawal update"),
  t("wallet.transfer-received", "wallet.transfer_received", "wallet", "success", ["amount","asset","sender_display","reference_id"], "Transfer received",
    "You received {{amount}} {{asset}} from {{sender_display}}. Reference: {{reference_id}}."),
  t("wallet.transfer-sent", "wallet.transfer_sent", "wallet", "info", ["amount","asset","recipient_display","transaction_status","tx_hash_short"], "Transfer status updated",
    "Your transfer of {{amount}} {{asset}} to {{recipient_display}} is {{transaction_status}}. Reference: {{tx_hash_short}}."),
  t("mlcns.purchase-success", "mlcns.purchase_confirmed", "mlcns", "success", ["mlcns_amount","payment_amount","payment_currency","purchase_reference","mlcns_balance"], "Mallcoin purchase successful",
    "Your purchase of {{mlcns_amount}} MLCNS is complete. Paid: {{payment_amount}} {{payment_currency}}. Available balance: {{mlcns_balance}} MLCNS. Reference: {{purchase_reference}}.",
    ["in_app","email"], "Your Mallcoin purchase is confirmed"),
  t("mlcns.purchase-failed", "mlcns.purchase_failed", "mlcns", "warning", ["user_safe_reason","payment_status"], "Mallcoin purchase unsuccessful",
    "Your Mallcoin purchase could not be completed. Reason: {{user_safe_reason}}. Payment status: {{payment_status}}.",
    ["in_app","email"], "Mallcoin purchase update"),
  t("mlpts.earned", "mlpts.reward_earned", "mlpts", "success", ["amount","earning_activity","reward_status","activity_reference"], "Mallpoints earned",
    "You earned {{amount}} MLPTS from {{earning_activity}}. Status: {{reward_status}}. Reference: {{activity_reference}}."),
  t("mlpts.pending", "mlpts.reward_pending", "mlpts", "info", ["amount","earning_activity"], "Mallpoints pending approval",
    "You earned {{amount}} MLPTS from {{earning_activity}}. The reward is pending verification and is not yet available to spend or convert."),
  t("mlpts.conversion-complete", "mlpts.conversion_completed", "mlpts", "success", ["input_amount","output_amount","rate","conversion_reference"], "Mallpoints conversion completed",
    "{{input_amount}} MLPTS was converted to {{output_amount}} MLCNS at the confirmed rate {{rate}}. Reference: {{conversion_reference}}."),
  t("mining.campaign-created", "mining.campaign_created", "mining", "success", ["campaign_name","platform_name","task_type","budget_amount","campaign_status"], "Campaign created",
    "Your campaign {{campaign_name}} was created. Platform: {{platform_name}}. Task: {{task_type}}. Budget: {{budget_amount}} MLPTS. Status: {{campaign_status}}."),
  t("mining.proof-submitted", "mining.proof_submitted", "mining", "info", ["campaign_name","submission_reference"], "Proof submitted",
    "Your proof for {{campaign_name}} was received and is awaiting validation. Reference: {{submission_reference}}."),
  t("mining.proof-approved", "mining.proof_approved", "mining", "success", ["campaign_name","reward_amount","submission_reference"], "Submission approved",
    "Your submission for {{campaign_name}} was approved. {{reward_amount}} MLPTS has been credited. Reference: {{submission_reference}}."),
  t("mining.proof-rejected", "mining.proof_rejected", "mining", "warning", ["campaign_name","user_safe_reason"], "Submission not approved",
    "Your submission for {{campaign_name}} was not approved. Reason: {{user_safe_reason}}. An appeal may be available under the campaign rules."),
  t("marketplace.order-placed", "marketplace.order_placed", "marketplace", "success", ["order_number","item_name","order_total","currency","order_status"], "Order placed",
    "Order {{order_number}} for {{item_name}} was placed. Total: {{order_total}} {{currency}}. Status: {{order_status}}."),
  t("marketplace.new-order", "marketplace.new_order", "marketplace", "info", ["order_number","item_name","order_total","currency"], "New order received",
    "You received order {{order_number}} for {{item_name}}. Order total: {{order_total}} {{currency}}."),
  t("marketplace.order-cancelled", "marketplace.order_cancelled", "marketplace", "warning", ["order_number","user_safe_reason","refund_status"], "Order cancelled",
    "Order {{order_number}} was cancelled. Reason: {{user_safe_reason}}. Refund status: {{refund_status}}."),
  t("marketplace.support-ticket", "support.ticket_created", "support", "info", ["ticket_number"], "Support request received",
    "Your support request {{ticket_number}} has been received."),
  t("badge.awarded", "badge.awarded", "badges", "success", ["badge_name","award_reason"], "Badge awarded",
    "You have been awarded the {{badge_name}} badge. Reason: {{award_reason}}. Review your account for applicable privileges."),
  t("referral.reward", "referral.reward_confirmed", "referrals", "success", ["amount","activity_reference"], "Referral reward confirmed",
    "Your referral reward of {{amount}} MLCNS has been credited. Reference: {{activity_reference}}."),
  t("security.transfer-held", "security.transfer_held", "security", "critical", ["amount","asset","reference_id"], "Transfer held for review",
    "Your transfer of {{amount}} {{asset}} has been temporarily held for a security review. Reference: {{reference_id}}.",
    ["in_app","email","sms","push"], "Mallchain security alert"),
  t("network.rpc-unavailable", "network.rpc_unavailable", "network", "critical", ["network_name","incident_id"], "RPC service unavailable",
    "The {{network_name}} RPC service is temporarily unavailable. Incident: {{incident_id}}. Some dependent operations may be affected.",
    ["in_app","email"], "Mallchain network alert"),
  t("network.rpc-restored", "network.rpc_restored", "network", "success", ["network_name","incident_id"], "RPC service restored",
    "The {{network_name}} RPC service has recovered. Incident: {{incident_id}}.",
    ["in_app","email"], "Mallchain service restored"),
  t("governance.proposal-created", "governance.proposal_created", "governance", "info", ["proposal_id","proposal_title","voting_start","voting_end"], "Governance proposal submitted",
    "Proposal {{proposal_id}}, {{proposal_title}}, has been submitted. Voting opens {{voting_start}} and closes {{voting_end}}."),
  t("admin.permissions-changed", "admin.permissions_changed", "administration", "critical", ["admin_identifier","admin_action","audit_reference"], "Administrator permissions changed",
    "Administrator permissions for {{admin_identifier}} changed. Action: {{admin_action}}. Audit reference: {{audit_reference}}.",
    ["in_app","email"], "Mallchain administrator access alert"),
];

export const templateByEvent = new Map(templates.map(x => [x.eventType, x]));

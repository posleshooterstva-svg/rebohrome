// Historical schema additions, now applied explicitly before serving HTTP.
export const LEGACY_COLUMNS: ReadonlyArray<readonly [string,string]> = [
  [
    "transactions",
    "direction text"
  ],
  [
    "transactions",
    "balance_before integer"
  ],
  [
    "transactions",
    "balance_after integer"
  ],
  [
    "transactions",
    "source text not null default 'system'"
  ],
  [
    "transactions",
    "admin_note text"
  ],
  [
    "transactions",
    "support_note text"
  ],
  [
    "transactions",
    "visible_description text"
  ],
  [
    "transactions",
    "related_product_id text"
  ],
  [
    "transactions",
    "related_order_id text"
  ],
  [
    "transactions",
    "edited_by_admin_id text"
  ],
  [
    "transactions",
    "edited_at text"
  ],
  [
    "owned_cards",
    "status text not null default 'active'"
  ],
  [
    "owned_cards",
    "acquisition_source text not null default 'purchase'"
  ],
  [
    "owned_cards",
    "removed_at text"
  ],
  [
    "owned_cards",
    "delivery_mode text not null default 'digital'"
  ],
  [
    "owned_cards",
    "admin_note text"
  ],
  [
    "owned_cards",
    "visible_user_note text"
  ],
  [
    "owned_cards",
    "related_transaction_id text"
  ],
  [
    "owned_cards",
    "related_order_id text"
  ],
  [
    "owned_cards",
    "updated_at text"
  ],
  [
    "user_document_acceptances",
    "legal_confirmation_version text not null default '2026-06'"
  ],
  [
    "user_document_acceptances",
    "legal_confirmation_accepted_at text"
  ],
  [
    "users",
    "require_password_reset integer not null default 0"
  ],
  [
    "users",
    "withdraw_access_enabled integer not null default 1"
  ],
  [
    "users",
    "withdraw_access_disabled_at text"
  ],
  [
    "users",
    "withdraw_access_disabled_by text"
  ],
  [
    "users",
    "withdraw_access_disabled_reason text"
  ],
  [
    "users",
    "withdraw_access_restored_at text"
  ],
  [
    "users",
    "withdraw_access_restored_by text"
  ],
  [
    "users",
    "is_deleted integer not null default 0"
  ],
  [
    "users",
    "deleted_at text"
  ],
  [
    "users",
    "deleted_by text"
  ],
  [
    "users",
    "vault_integrity_score integer not null default 0"
  ],
  [
    "users",
    "vault_integrity_status text not null default 'Unstable'"
  ],
  [
    "users",
    "vault_integrity_updated_at text"
  ],
  [
    "users",
    "archive_rules_accepted_at text"
  ],
  [
    "users",
    "latest_terms_accepted_at text"
  ],
  [
    "users",
    "kyc_status text not null default 'not_started'"
  ],
  [
    "users",
    "kyc_verified integer not null default 0"
  ],
  [
    "users",
    "kyc_provider text"
  ],
  [
    "users",
    "veriff_session_id text"
  ],
  [
    "users",
    "veriff_verification_id text"
  ],
  [
    "users",
    "veriff_status text"
  ],
  [
    "users",
    "veriff_decision text"
  ],
  [
    "users",
    "veriff_reason text"
  ],
  [
    "users",
    "kyc_started_at text"
  ],
  [
    "users",
    "kyc_submitted_at text"
  ],
  [
    "users",
    "kyc_verified_at text"
  ],
  [
    "users",
    "kyc_declined_at text"
  ],
  [
    "users",
    "kyc_last_webhook_at text"
  ],
  [
    "users",
    "kyc_manual_override integer not null default 0"
  ],
  [
    "users",
    "kyc_manual_override_by text"
  ],
  [
    "users",
    "kyc_manual_override_at text"
  ],
  [
    "users",
    "kyc_manual_override_reason text"
  ],
  [
    "profiles",
    "payment_phone text"
  ],
  [
    "profiles",
    "gate2_first_name text"
  ],
  [
    "profiles",
    "gate2_last_name text"
  ],
  [
    "profiles",
    "gate2_phone text"
  ],
  [
    "profiles",
    "gate2_details_updated_at text"
  ],
  [
    "payment_providers",
    "min_deposit_amount real not null default 10"
  ],
  [
    "payment_providers",
    "max_deposit_amount real"
  ],
  [
    "payment_providers",
    "default_deposit_amount real"
  ],
  [
    "payment_providers",
    "currency text not null default 'USD'"
  ],
  [
    "payment_sessions",
    "token_id integer"
  ],
  [
    "payment_sessions",
    "token_quantity integer"
  ],
  [
    "payment_sessions",
    "contract_address text"
  ],
  [
    "payment_sessions",
    "contract_order_id text"
  ],
  [
    "payment_sessions",
    "sc_input_data text"
  ],
  [
    "payment_sessions",
    "chain_network text"
  ],
  [
    "payment_sessions",
    "recipient_wallet text"
  ],
  [
    "payment_sessions",
    "nft_delivery_mode text"
  ],
  [
    "payment_sessions",
    "chain_tx_hash text"
  ],
  [
    "payment_sessions",
    "nft_delivered_at text"
  ],
  [
    "deposit_payment_sessions",
    "token_id integer"
  ],
  [
    "deposit_payment_sessions",
    "token_quantity integer"
  ],
  [
    "deposit_payment_sessions",
    "contract_address text"
  ],
  [
    "deposit_payment_sessions",
    "contract_order_id text"
  ],
  [
    "deposit_payment_sessions",
    "sc_input_data text"
  ],
  [
    "deposit_payment_sessions",
    "chain_network text"
  ],
  [
    "deposit_payment_sessions",
    "recipient_wallet text"
  ],
  [
    "deposit_payment_sessions",
    "nft_delivery_mode text"
  ],
  [
    "deposit_payment_sessions",
    "chain_tx_hash text"
  ],
  [
    "deposit_payment_sessions",
    "nft_delivered_at text"
  ],
  [
    "balances",
    "payout_bonus_override_enabled integer not null default 0"
  ],
  [
    "balances",
    "payout_bonus_percent integer"
  ],
  [
    "transactions",
    "provider_checked_at text"
  ],
  [
    "transactions",
    "processed_at text"
  ],
  [
    "transactions",
    "credited_at text"
  ],
  [
    "transactions",
    "next_check_at text"
  ],
  [
    "transactions",
    "last_error text"
  ],
  [
    "transactions",
    "reconciliation_attempts integer not null default 0"
  ],
  [
    "transactions",
    "environment text not null default 'production'"
  ],
  [
    "withdrawal_requests",
    "requested_amount integer"
  ],
  [
    "withdrawal_requests",
    "base_payout_percent integer not null default 60"
  ],
  [
    "withdrawal_requests",
    "bonus_payout_percent integer not null default 0"
  ],
  [
    "withdrawal_requests",
    "final_payout_percent integer not null default 60"
  ],
  [
    "withdrawal_requests",
    "payout_amount integer"
  ],
  [
    "withdrawal_requests",
    "wallet_usdt_bep20 text"
  ],
  [
    "withdrawal_requests",
    "status_updated_by text"
  ],
  [
    "withdrawal_requests",
    "status_updated_at text"
  ],
  [
    "withdrawal_requests",
    "payout_provider text"
  ],
  [
    "withdrawal_requests",
    "payout_currency text not null default 'USDT'"
  ],
  [
    "withdrawal_requests",
    "payout_network text"
  ],
  [
    "withdrawal_requests",
    "payout_address text"
  ],
  [
    "withdrawal_requests",
    "xrocket_withdrawal_id text"
  ],
  [
    "withdrawal_requests",
    "xrocket_status text"
  ],
  [
    "withdrawal_requests",
    "xrocket_raw_response text"
  ],
  [
    "withdrawal_requests",
    "xrocket_sent_at text"
  ],
  [
    "withdrawal_requests",
    "xrocket_confirmed_at text"
  ],
  [
    "withdrawal_requests",
    "payout_tx_hash text"
  ],
  [
    "withdrawal_requests",
    "payout_error text"
  ],
  [
    "withdrawal_requests",
    "payout_attempts integer not null default 0"
  ],
  [
    "broadcasts",
    "telegram_channel_enabled integer not null default 1"
  ],
  [
    "broadcasts",
    "telegram_channel_id text"
  ],
  [
    "broadcasts",
    "telegram_channel_message_id text"
  ],
  [
    "broadcasts",
    "telegram_channel_status text"
  ],
  [
    "broadcasts",
    "telegram_channel_error text"
  ],
  [
    "broadcasts",
    "telegram_channel_sent_at text"
  ],
  [
    "broadcasts",
    "telegram_channel_caption text"
  ],
  [
    "broadcasts",
    "telegram_channel_translated integer not null default 0"
  ],
  [
    "broadcasts",
    "telegram_channel_image_path text"
  ],
  [
    "notifications",
    "broadcast_id text"
  ],
  [
    "notifications",
    "cta_label text"
  ],
  [
    "notifications",
    "cta_url text"
  ],
  [
    "notifications",
    "expires_at text"
  ],
  [
    "notifications",
    "show_as_popup integer not null default 0"
  ],
  [
    "notifications",
    "dismissed_at text"
  ],
  [
    "deposit_payment_sessions",
    "provider_environment text"
  ],
  [
    "deposit_payment_sessions",
    "provider_checkout_env text"
  ],
  [
    "deposit_payment_sessions",
    "amount_cents integer"
  ],
  [
    "deposit_payment_sessions",
    "provider_session_key text"
  ],
  [
    "deposit_payment_sessions",
    "provider_checkout_jwt text"
  ],
  [
    "deposit_payment_sessions",
    "provider_payment_id text"
  ],
  [
    "deposit_payment_sessions",
    "provider_event_id text"
  ],
  [
    "deposit_payment_sessions",
    "provider_raw_status text"
  ],
  [
    "deposit_payment_sessions",
    "provider_raw_payload text"
  ],
  [
    "deposit_payment_sessions",
    "coinflow_customer_id text"
  ],
  [
    "deposit_payment_sessions",
    "coinflow_payment_id text"
  ],
  [
    "deposit_payment_sessions",
    "coinflow_webhook_info text"
  ],
  [
    "deposit_payment_sessions",
    "coinflow_settlement_type text"
  ],
  [
    "deposit_payment_sessions",
    "coinflow_last4 text"
  ],
  [
    "deposit_payment_sessions",
    "coinflow_bin text"
  ],
  [
    "deposit_payment_sessions",
    "coinflow_card_token text"
  ],
  [
    "deposit_payment_sessions",
    "coinflow_residence_country text"
  ],
  [
    "deposit_payment_sessions",
    "coinflow_request_country text"
  ],
  [
    "deposit_payment_sessions",
    "coinflow_request_ip text"
  ],
  [
    "deposit_payment_sessions",
    "idempotency_key text"
  ],
  [
    "deposit_payment_sessions",
    "completed_at text"
  ],
  [
    "deposit_payment_sessions",
    "failed_at text"
  ],
  [
    "withdrawal_requests",
    "telegram_chat_id text"
  ],
  [
    "profiles",
    "telegram_chat_id text"
  ],
  [
    "profiles",
    "telegram_verified integer not null default 0"
  ],
  [
    "profiles",
    "telegram_verified_at text"
  ],
  [
    "profiles",
    "telegram_linked_at text"
  ],
  [
    "withdrawal_requests",
    "telegram_message_id text"
  ],
  [
    "withdrawal_requests",
    "telegram_sync_status text not null default 'pending'"
  ],
  [
    "withdrawal_requests",
    "telegram_synced_at text"
  ],
  [
    "withdrawal_requests",
    "telegram_last_error text"
  ],
  [
    "withdrawal_requests",
    "last_action_source text not null default 'system'"
  ],
  [
    "withdrawal_requests",
    "last_updated_by_admin_id text"
  ],
  [
    "admin_logs",
    "source text not null default 'dashboard'"
  ],
  [
    "admin_logs",
    "previous_status text"
  ],
  [
    "admin_logs",
    "next_status text"
  ],
  [
    "admin_logs",
    "metadata_json text"
  ],
  [
    "orders",
    "currency text not null default 'USD'"
  ],
  [
    "orders",
    "payment_provider text"
  ],
  [
    "orders",
    "transvoucher_transaction_id text"
  ],
  [
    "orders",
    "transvoucher_reference_id text"
  ],
  [
    "orders",
    "provider_status text"
  ],
  [
    "orders",
    "paid_at text"
  ],
  [
    "payment_sessions",
    "transvoucher_transaction_id text"
  ],
  [
    "payment_sessions",
    "transvoucher_reference_id text"
  ],
  [
    "payment_sessions",
    "payment_url text"
  ],
  [
    "payment_sessions",
    "provider_status text"
  ],
  [
    "payment_sessions",
    "raw_provider_response text"
  ],
  [
    "deposit_payment_sessions",
    "transvoucher_transaction_id text"
  ],
  [
    "deposit_payment_sessions",
    "transvoucher_reference_id text"
  ],
  [
    "deposit_payment_sessions",
    "payment_url text"
  ],
  [
    "deposit_payment_sessions",
    "provider_status text"
  ],
  [
    "deposit_payment_sessions",
    "raw_provider_response text"
  ],
  [
    "deposit_payment_sessions",
    "provider_key text"
  ],
  [
    "deposit_payment_sessions",
    "provider_click_id text"
  ],
  [
    "deposit_payment_sessions",
    "provider_order_id text"
  ],
  [
    "deposit_payment_sessions",
    "balance_credited_at text"
  ],
  [
    "transactions",
    "original_amount integer"
  ],
  [
    "transactions",
    "original_currency text"
  ],
  [
    "transactions",
    "display_currency text"
  ],
  [
    "transactions",
    "credited_amount_usd integer"
  ],
  [
    "transactions",
    "exchange_rate real"
  ],
  [
    "transactions",
    "payment_method text"
  ],
  [
    "transactions",
    "payment_provider text"
  ],
  [
    "transactions",
    "transvoucher_transaction_id text"
  ],
  [
    "transactions",
    "transvoucher_reference_id text"
  ],
  [
    "transactions",
    "payment_url text"
  ],
  [
    "transactions",
    "provider_status text"
  ],
  [
    "transactions",
    "raw_provider_response text"
  ],
  [
    "transactions",
    "paid_at text"
  ],
  [
    "deposits",
    "original_amount integer"
  ],
  [
    "deposits",
    "original_currency text"
  ],
  [
    "deposits",
    "credited_amount_usd integer"
  ],
  [
    "deposits",
    "exchange_rate real"
  ],
  [
    "deposits",
    "payment_provider text"
  ],
  [
    "deposits",
    "transvoucher_transaction_id text"
  ],
  [
    "deposits",
    "transvoucher_reference_id text"
  ],
  [
    "deposits",
    "updated_at text"
  ],
  [
    "deposits",
    "paid_at text"
  ],
  [
    "products",
    "currency text not null default 'USD'"
  ],
  [
    "products",
    "default_delivery_type text not null default 'digital'"
  ],
  [
    "products",
    "featured integer not null default 0"
  ],
  [
    "products",
    "homepage_featured integer not null default 0"
  ],
  [
    "products",
    "featured_started_at text"
  ],
  [
    "products",
    "is_randomized integer not null default 0"
  ],
  [
    "products",
    "randomized_outcomes_json text not null default '[]'"
  ],
  [
    "products",
    "image_path text"
  ],
  [
    "products",
    "image_updated_at text"
  ],
  [
    "products",
    "showcase_float real not null default 1"
  ],
  [
    "products",
    "showcase_rotation_seconds integer not null default 12"
  ],
  [
    "products",
    "status text not null default 'active'"
  ]
];

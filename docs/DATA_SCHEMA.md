# 全球多模態情資 Schema v0.1

狀態：設計基線；尚未代表所有來源已接入。

## L0 `sources`

必要欄位：`source_id`, `name`, `origin_url`, `publisher`, `jurisdiction`, `language[]`, `modality[]`, `source_kind`, `update_cadence`, `last_checked_at`, `retrieved_at`, `source_version`, `source_hash`, `terms_url`, `license_name`, `license_url`, `commercial_use_allowed`, `redistribution_allowed`, `derivatives_allowed`, `training_allowed`, `personal_data_risk`, `verification_notes`, `reviewed_by`, `approval_status`。

`approval_status`：`candidate | research_only | approved_for_internal | approved_for_distribution | rejected`。權利布林欄位可為 `null`，表示未知且不允許發布。

## L1–L4 `records`

必要欄位：`record_id`, `source_id`, `raw_ref_private`, `record_hash`, `modality`, `language`, `jurisdiction`, `event_date`, `capture_date`, `scam_family`, `signal_families[]`, `label`, `label_basis`, `verification_status`, `confidence`, `evidence_span[]`, `normalized_text`, `indicator_refs[]`, `privacy_review_status`, `duplicate_group_id`, `dataset_split`, `expires_at`。

- `modality`：`text | image | audio_transcript | call_complaint | url | social_post`
- `label`：`confirmed_scam | suspected_scam | benign | anti_scam_warning | unknown`
- `label_basis`：`official_action | human_review | unverified_report | synthetic`
- `dataset_split`：`development | holdout | temporal_holdout | excluded`

## `indicators`

`indicator_id`, `type`, `normalized_value`, `exact_match_scope`, `source_id`, `verification_status`, `first_seen`, `last_seen`, `expires_at`, `conflict_status`, `export_allowed`。

精確指標與一般文字正規化分離。URL、網域、電話、LINE ID 保留原值於私人稽核區，公開包只輸出核准的正規化值。

## `rules`

`rule_id`, `signal_family`, `language`, `patterns[]`, `context_constraints`, `negation_exclusions`, `severity_seed`, `source_refs[]`, `human_review_status`, `revision_id`。

首版訊號族群：`SOCIAL_PROOF`, `REDIRECT`, `AUTHORITY`, `URGENCY_SECRECY`, `PAYMENT`, `PROFIT_PROMISE`, `CREDENTIALS_TOOLS`, `JOB_SHOPPING`。同族群多個詞不得無限重複加分。

## `dataset_versions`

`version`, `created_at`, `released_at`, `source_versions`, `checksums`, `record_counts`, `excluded_counts`, `qa_summary`, `signing_key_id`, `rollback_ref`。

## 發布閘門

只有同時滿足以下條件的記錄可以輸出：

1. 來源 `approval_status=approved_for_distribution`。
2. `privacy_review_status=passed`。
3. `export_allowed=true`。
4. 不含 `raw_ref_private`、姓名、電話原文、私人截圖或錄音。
5. 格式、去重、撤回、過期、官方網域衝突及回歸測試全部通過。


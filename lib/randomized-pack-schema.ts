export const RANDOMIZED_PACK_CREATE_STATEMENTS = [
  `create table if not exists randomized_pack_policies (
    pack_product_id text primary key,
    minimum_value real not null,
    maximum_value real not null,
    title_pattern text,
    formula_version text not null,
    enabled integer not null default 1,
    created_at text not null,
    updated_at text not null
  )`,
  `create table if not exists randomized_pack_versions (
    id text primary key,
    pack_product_id text not null,
    version integer not null,
    status text not null,
    seed text not null,
    formula_version text not null,
    total_probability_bps integer not null,
    expected_value real not null,
    big_win_probability_bps integer not null,
    created_at text not null,
    published_at text,
    unique(pack_product_id, version)
  )`,
  `create table if not exists randomized_pack_outcomes (
    id text primary key,
    version_id text not null,
    outcome_product_id text not null,
    probability_bps integer not null,
    price_snapshot real not null,
    title_snapshot text not null,
    ordinal integer not null,
    unique(version_id, outcome_product_id)
  )`,
  `create table if not exists randomized_pack_reservations (
    id text primary key,
    order_id text not null,
    order_item_id text not null unique,
    user_id text not null,
    pack_product_id text not null,
    version_id text not null,
    outcome_product_id text not null,
    roll integer not null,
    status text not null,
    expires_at text not null,
    created_at text not null,
    updated_at text not null,
    consumed_at text,
    released_at text,
    release_reason text
  )`,
  `create table if not exists randomized_pack_draws (
    id text primary key,
    order_id text not null,
    order_item_id text not null unique,
    user_id text not null,
    pack_product_id text not null,
    version_id text not null,
    outcome_product_id text not null,
    reservation_id text not null unique,
    roll integer not null,
    probability_bps integer not null,
    price_snapshot real not null,
    created_at text not null
  )`,
  "create index if not exists idx_randomized_pack_versions_published on randomized_pack_versions(pack_product_id, status, version desc)",
  "create index if not exists idx_randomized_pack_outcomes_version on randomized_pack_outcomes(version_id, ordinal)",
  "create index if not exists idx_randomized_pack_reservations_active on randomized_pack_reservations(outcome_product_id, status, expires_at)",
  "create index if not exists idx_randomized_pack_reservations_order on randomized_pack_reservations(order_id, status)",
  `create trigger if not exists trg_randomized_pack_version_draft_first
    before insert on randomized_pack_versions
    when new.status = 'published'
    begin
      select raise(abort, 'Randomized pack versions must be validated as drafts before publication');
    end`,
  `create trigger if not exists trg_randomized_pack_version_validate_publish
    before update of status on randomized_pack_versions
    when new.status = 'published'
    begin
      select case when new.total_probability_bps <> 10000
        then raise(abort, 'Randomized pack version total must equal 10000 bps') end;
      select case when (select count(*) from randomized_pack_outcomes where version_id = new.id) < 2
        then raise(abort, 'Randomized pack version requires at least two outcomes') end;
      select case when (select coalesce(sum(probability_bps), 0) from randomized_pack_outcomes where version_id = new.id) <> 10000
        then raise(abort, 'Randomized pack outcomes must equal 10000 bps') end;
    end`,
  `create trigger if not exists trg_randomized_pack_version_immutable
    before update on randomized_pack_versions
    when old.status in ('published', 'retired') and (
      new.pack_product_id <> old.pack_product_id or
      new.version <> old.version or
      new.seed <> old.seed or
      new.formula_version <> old.formula_version or
      new.total_probability_bps <> old.total_probability_bps or
      new.expected_value <> old.expected_value or
      new.big_win_probability_bps <> old.big_win_probability_bps or
      new.created_at <> old.created_at
    )
    begin
      select raise(abort, 'Published randomized pack versions are immutable');
    end`,
  `create trigger if not exists trg_randomized_pack_version_no_delete
    before delete on randomized_pack_versions
    when old.status in ('published', 'retired')
    begin
      select raise(abort, 'Published randomized pack versions cannot be deleted');
    end`,
  `create trigger if not exists trg_randomized_pack_outcome_validate_insert
    before insert on randomized_pack_outcomes
    when new.probability_bps < 1 or new.probability_bps > 10000
    begin
      select raise(abort, 'Randomized pack probability must be between 1 and 10000 bps');
    end`,
  `create trigger if not exists trg_randomized_pack_outcome_immutable_update
    before update on randomized_pack_outcomes
    when exists (
      select 1 from randomized_pack_versions
      where id = old.version_id and status in ('published', 'retired')
    )
    begin
      select raise(abort, 'Published randomized pack outcomes are immutable');
    end`,
  `create trigger if not exists trg_randomized_pack_outcome_immutable_delete
    before delete on randomized_pack_outcomes
    when exists (
      select 1 from randomized_pack_versions
      where id = old.version_id and status in ('published', 'retired')
    )
    begin
      select raise(abort, 'Published randomized pack outcomes cannot be deleted');
    end`,
  `create trigger if not exists trg_randomized_pack_draw_validate_insert
    before insert on randomized_pack_draws
    when new.roll < 0 or new.roll >= 10000 or new.probability_bps < 1 or new.probability_bps > 10000
    begin
      select raise(abort, 'Randomized pack draw is outside the published probability range');
    end`,
  `create trigger if not exists trg_randomized_pack_draw_immutable_update
    before update on randomized_pack_draws
    begin
      select raise(abort, 'Randomized pack draws are immutable');
    end`,
  `create trigger if not exists trg_randomized_pack_draw_immutable_delete
    before delete on randomized_pack_draws
    begin
      select raise(abort, 'Randomized pack draws cannot be deleted');
    end`,
] as const;

export const RANDOMIZED_PACK_ORDER_ITEM_COLUMNS = [
  "randomized_pack_version_id text",
  "reserved_outcome_product_id text",
  "drawn_product_id text",
  "randomized_draw_id text",
] as const;

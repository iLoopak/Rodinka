-- Family-level visual customization for the stable shopping category keys.
alter table public.families
  add column if not exists shopping_category_settings jsonb not null default '{}'::jsonb;

alter table public.families
  drop constraint if exists families_shopping_category_settings_shape;

alter table public.families
  add constraint families_shopping_category_settings_shape check (
    jsonb_typeof(shopping_category_settings) = 'object'
    and shopping_category_settings - 'produce' - 'bakery' - 'meat' - 'dairy' - 'household' - 'pharmacy' - 'other' = '{}'::jsonb
  );

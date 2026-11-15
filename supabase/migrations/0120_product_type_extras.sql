-- Product type extras (seeds A24 to A28): what a type carries beyond its axes and spec rows, as one small object.
--   tiers        price-step starts for services priced by quantity (A14 shape; the seller fills in the prices)
--   priceGrid    the axes whose combinations are priced one by one (water: size x fill, car wash: wash x vehicle)
--   compat       the compatible-model list a case, protector or spare part is matched against
--   sizeChart    which size chart the type links to; open lists the typed (open) value kinds; measureUnit for measured types
-- The shape is validated in shared (validateProductType); the database only insists it is an object.
alter table public.product_types add column if not exists extras jsonb not null default '{}'::jsonb;
alter table public.product_types drop constraint if exists product_types_extras_shape;
alter table public.product_types add constraint product_types_extras_shape check (jsonb_typeof(extras) = 'object');

-- Only the temporary, unexposed test schema is removed. No customer/business
-- table is touched; its creation and removal are versioned together.
set local lock_timeout='5s';
drop schema confetti_validacion_20261002 cascade;

-- A small picture per product, stored as a data URL (about 5-15 KB after the back office shrinks it).
alter table products add column if not exists image text;

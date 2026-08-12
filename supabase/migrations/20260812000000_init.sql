-- Baseline: enable pgcrypto (used for auth password hashing + gen_random_uuid).
-- Auth users, storage buckets, and tables come later, as their own feature migrations.
create extension if not exists pgcrypto;

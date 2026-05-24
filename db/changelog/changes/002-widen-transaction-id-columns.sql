--liquibase formatted sql

--changeset portfolio:002-widen-transaction-id-columns
ALTER TABLE transactions ALTER COLUMN id NVARCHAR(256) NOT NULL;
ALTER TABLE transactions ALTER COLUMN txn_id NVARCHAR(256) NOT NULL;

--rollback ALTER TABLE transactions ALTER COLUMN id NVARCHAR(128) NOT NULL;
--rollback ALTER TABLE transactions ALTER COLUMN txn_id NVARCHAR(128) NOT NULL;

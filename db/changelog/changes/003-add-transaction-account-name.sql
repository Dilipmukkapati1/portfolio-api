--liquibase formatted sql

--changeset portfolio:003-add-transaction-account-name
ALTER TABLE transactions ADD account_name NVARCHAR(256) NULL;

--rollback ALTER TABLE transactions DROP COLUMN account_name;

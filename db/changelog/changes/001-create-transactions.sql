--liquibase formatted sql

--changeset portfolio:001-create-transactions
CREATE TABLE transactions (
    id NVARCHAR(128) NOT NULL,
    household_id NVARCHAR(128) NOT NULL,
    txn_id NVARCHAR(128) NOT NULL,
    account_id NVARCHAR(128) NOT NULL,
    source NVARCHAR(32) NOT NULL CONSTRAINT DF_transactions_source DEFAULT 'simplefin',
    amount DECIMAL(18, 4) NOT NULL,
    currency CHAR(3) NOT NULL CONSTRAINT DF_transactions_currency DEFAULT 'USD',
    txn_date DATE NOT NULL,
    transacted_at DATETIME2 NULL,
    posted_at DATETIME2 NULL,
    description NVARCHAR(512) NOT NULL,
    memo NVARCHAR(512) NULL,
    merchant NVARCHAR(256) NULL,
    category NVARCHAR(32) NOT NULL CONSTRAINT DF_transactions_category DEFAULT 'uncategorized',
    category_source NVARCHAR(16) NOT NULL CONSTRAINT DF_transactions_category_source DEFAULT 'auto',
    provider_category NVARCHAR(64) NULL,
    pending BIT NOT NULL CONSTRAINT DF_transactions_pending DEFAULT 0,
    external_id NVARCHAR(256) NULL,
    created_at DATETIME2 NOT NULL,
    updated_at DATETIME2 NOT NULL,
    CONSTRAINT PK_transactions PRIMARY KEY (id),
    CONSTRAINT UQ_transactions_household_txn UNIQUE (household_id, txn_id)
);

CREATE INDEX ix_transactions_household_date
    ON transactions (household_id, txn_date DESC);

CREATE INDEX ix_transactions_household_category
    ON transactions (household_id, category);

CREATE INDEX ix_transactions_household_account
    ON transactions (household_id, account_id);

CREATE INDEX ix_transactions_household_pending
    ON transactions (household_id, pending);

--rollback DROP INDEX ix_transactions_household_pending ON transactions;
--rollback DROP INDEX ix_transactions_household_account ON transactions;
--rollback DROP INDEX ix_transactions_household_category ON transactions;
--rollback DROP INDEX ix_transactions_household_date ON transactions;
--rollback DROP TABLE transactions;

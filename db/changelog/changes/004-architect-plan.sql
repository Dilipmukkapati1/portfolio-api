--liquibase formatted sql

--changeset portfolio:004-architect-plan
CREATE TABLE architect_plan (
    household_id NVARCHAR(128) NOT NULL,
    total_capital DECIMAL(18, 2) NULL,
    equities_percent DECIMAL(6, 2) NOT NULL CONSTRAINT DF_architect_equities DEFAULT 55,
    bonds_percent DECIMAL(6, 2) NOT NULL CONSTRAINT DF_architect_bonds DEFAULT 35,
    cash_percent DECIMAL(6, 2) NOT NULL CONSTRAINT DF_architect_cash DEFAULT 10,
    updated_at DATETIME2 NOT NULL,
    CONSTRAINT PK_architect_plan PRIMARY KEY (household_id)
);

CREATE TABLE architect_targets (
    id NVARCHAR(128) NOT NULL,
    household_id NVARCHAR(128) NOT NULL,
    symbol NVARCHAR(32) NOT NULL,
    name NVARCHAR(256) NOT NULL,
    asset_class NVARCHAR(16) NOT NULL,
    planned_percent DECIMAL(6, 2) NOT NULL,
    sort_order INT NOT NULL CONSTRAINT DF_architect_targets_sort DEFAULT 0,
    created_at DATETIME2 NOT NULL,
    updated_at DATETIME2 NOT NULL,
    CONSTRAINT PK_architect_targets PRIMARY KEY (id),
    CONSTRAINT UQ_architect_targets_household_symbol UNIQUE (household_id, symbol)
);

CREATE INDEX ix_architect_targets_household
    ON architect_targets (household_id, sort_order);

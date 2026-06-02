--liquibase formatted sql

--changeset portfolio:005-architect-categories
ALTER TABLE architect_plan ADD mutual_funds_percent DECIMAL(6, 2) NOT NULL
    CONSTRAINT DF_architect_mutual_funds DEFAULT 0;

EXEC sp_rename 'architect_plan.equities_percent', 'index_funds_percent', 'COLUMN';

ALTER TABLE architect_targets ADD planned_amount DECIMAL(18, 2) NULL;

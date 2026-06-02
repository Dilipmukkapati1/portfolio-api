--liquibase formatted sql

--changeset portfolio:006-drop-architect-tables
DROP TABLE IF EXISTS architect_targets;
DROP TABLE IF EXISTS architect_plan;

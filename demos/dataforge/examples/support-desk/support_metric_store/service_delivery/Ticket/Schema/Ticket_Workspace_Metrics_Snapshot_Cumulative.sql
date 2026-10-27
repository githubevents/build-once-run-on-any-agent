-- Ticket metrics at workspace grain, counting events up to and including SNAPSHOT_DATE.
-- Uppercase columns are system columns written by every pipeline in the store.

CREATE TABLE IF NOT EXISTS {TARGET_CATALOG}.Ticket_Workspace_Metrics_Snapshot_Cumulative (
    SNAPSHOT_DATE   DATE         NOT NULL,
    account_id      BIGINT       NOT NULL,
    workspace_id    BIGINT       NOT NULL,
    metric_name     VARCHAR(128) NOT NULL,
    metric_value    BIGINT       NOT NULL,
    LOAD_TIMESTAMP  TIMESTAMP    NOT NULL,
    SOURCE_ZONE     VARCHAR(16)  NOT NULL
);

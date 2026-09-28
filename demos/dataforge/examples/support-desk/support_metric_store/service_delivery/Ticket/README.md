# Ticket

Support ticket lifecycle metrics for the service delivery domain.

## Metrics

| Metric | Grains | Cadences | Source |
| --- | --- | --- | --- |
| `total_ticket_create_count` | account, workspace, user | Daily, Cumulative | `tickets.created_at` |
| `total_ticket_close_count` | account, workspace, user | Daily, Cumulative | `tickets.closed_at` |

Soft-deleted rows (`is_deleted = true`) are excluded from every metric.

## Development history

| Date | Change | Issue |
| --- | --- | --- |
| 2026-01-15 | Initial build: create and close counts at three grains | #1 |

# support_metric_store

The metric store for the support-desk example. `forge-init` scans this tree to
discover the domain taxonomy, the entity folder structure, and the naming
conventions — none of it is declared in the manifest.

## Layout

```
support_metric_store/
  common/                      # runners and shared config (not a domain)
  service_delivery/            # domain
    Ticket/                    # entity
      Code/                    # pipelines, one file per cadence
      Schema/                  # table DDL, one file per grain and cadence
      Schema/Alter/            # column additions to existing tables
      README.md                # metric inventory and development history
```

## Key numbers

| | |
| --- | --- |
| Domains | 1 (`service_delivery`) |
| Entities built | 1 of 3 (`Ticket`; `incident` and `release` are unbuilt) |
| Grains | 3 (`account_id`, `workspace_id`, `user_id`) |
| Cadences | 2 (Daily, Cumulative) |
| Tables per entity | 6 |
| Zones | 2 (`zone1`, `zone2`) |

## Conventions

Metric columns are `total_{entity}_{verb}_count`. System columns
(`SNAPSHOT_DATE`, `LOAD_TIMESTAMP`, `SOURCE_ZONE`) are uppercase; everything
else is `lowercase_snake_case`. Table names are
`{Entity}_{Grain}_Metrics_Snapshot_{Cadence}`.

`forge-lint` enforces all of the above. The rules live in the skill, the
vocabulary they are applied to comes from the resolved manifest.

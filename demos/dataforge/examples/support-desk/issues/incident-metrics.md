<!--
The intake artifact for the demo. Create it as a real issue so forge-builder
Phase 1 reads it the way it will in production:

    gh label create metric-request --color 0E8A16 --force
    gh issue create --title "Add incident lifecycle metrics" \
      --body-file examples/support-desk/issues/incident-metrics.md \
      --label metric-request

Phase 1 is deliberately built to handle an issue this vague. The grain, the
verb set, the cadences, and the soft-delete rule are all things it has to ask
about or infer from the manifest -- none of them are stated below.
-->

Support leadership wants the same visibility into incidents that we already
have for tickets. Right now we can answer "how many tickets did this account
open last month" but not the equivalent question for incidents, so incident
load has to be pulled by hand out of the source tables every time someone asks.

What we need, roughly:

- How many incidents get opened, and how many get resolved
- Broken out the same way ticket metrics are, so the two can sit side by side
  in the same dashboard
- Available for both zones

The `incidents` source table already exists in the service delivery source
schema and is populated in both zones.

Not in scope for this request: time-to-resolve, severity-weighted counts, and
anything that requires joining to the on-call roster. Those are follow-ups.

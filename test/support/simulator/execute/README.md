# Executing events

Carries out the operator, summary log and report events the calendar plans,
against the service through the seeders the specs already use, under the
simulated clock. The runner moves the clock and hands events over; this module
does each one.

```js
import { createRun, executeEvent } from './execute.js'

const run = createRun({ population, rows })
for (const event of operator.events) {
  setSimulatedNow(event.at)
  await new Promise((resolve) => setTimeout(resolve, 500)) // the stack re-reads the clock every 250 ms
  await executeEvent(run, event)
}
```

`createRun` takes the planned population and rows and holds what the service
now knows: which planned operators and registrations exist, under what ids
and numbers, who is signed in, and every upload a registration has made so
far. Hand one operator's events over in calendar order. Events of different
operators are independent of each other.

`executeEvent` refuses an event type it has no executor for, by name, so a
calendar that reaches a PRN event stops rather than skipping it.

## What each event does

| Event                     | Against the service                                                                                                                                                                                                                                                                        |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `registration.approved`   | The first time for an operator: applies for the organisation with every registration and accreditation the population gave it, and links a Defra ID user. Every time: approves that registration and its accreditation, granting their numbers, and registers an exporter's overseas site. |
| `accreditation.suspended` | Suspends the accreditation.                                                                                                                                                                                                                                                                |
| `accreditation.cancelled` | Cancels the registration, which the service cascades to the accreditation.                                                                                                                                                                                                                 |
| `summary-log.uploaded`    | Renders the workbook `uploadRows` gives for it, uploads it through cdp-uploader, waits for the validation the plan expects, and submits it if the plan says it landed.                                                                                                                     |
| `report.submitted`        | Creates, fills and submits the period's report.                                                                                                                                                                                                                                            |

A summary log that comes back other than planned stops the run: a fatal
rejection has to come back `invalid` and an error on a row `validated`, each
reporting the issue the plan planted by its code, and anything else
`validated` with no issue beyond a warning.

## What the operator types into a report

The service aggregates a report's activity from the summary log. What is left
is typed here:

| Registration            | Fields                                                          |
| ----------------------- | --------------------------------------------------------------- |
| Reprocessor, accredited | tonnage recycled and not recycled, PRN revenue and free tonnage |
| Reprocessor, registered | tonnage recycled and not recycled                               |
| Exporter, accredited    | PRN revenue and free tonnage                                    |
| Exporter, registered    | tonnage received but not exported                               |

Tonnage recycled is what the registration's planned rows credited over the
period. The rest is zero: the PRN figures are the PRN executor's to fill, and
nothing planned is not recycled or not exported.

## Numbers

A registration or accreditation number is built as the register builds it:
the year the registration went active, its nation, its processing type, the
six-digit organisation id and a serial. The organisation id is the one the
service assigned when the operator applied, which the service counts up from
500000, so every number in a run is distinct from every other run's against
the same database with no registry to keep. The serial is the registration's
position within the operator.

Nothing checks a seeded number for uniqueness: the seeders write numbers
through the non-prod organisation PUT, which never reaches the status-history
route that does. A clash would sit in the register as two operators sharing a
number rather than be refused.

## Three vocabularies

The population plans a registration as `exporter` or `reprocessor` in a nation
named in full. The row planner puts it on one of the generator's five streams.
The seeders take `Exporter` or `Reprocessor` with `input` or `output` beside
it, and a number wants the nation as a letter. `join.js` is the whole of the
translation. A registered-only reprocessor
declares `input`, because its shorter template is a received-and-sent-on log.

## Signing in

A Defra ID token lasts an hour of simulated time, and a clock jump can spend
that at once. Before an event calls the service as the operator, the run signs
the user in again if the token it holds is within five minutes of ageing out.

## Running the hand-written list

`hand-run.js` replays a quarter of three registrations drawn from a small
planned population. One operator's accredited exporter and reprocessor each
go through approval, a submitted upload, a report, one upload of every
rejection kind, an abandoned one, a second submitted upload restating the
closed month, that month's resubmission and the next report, then one is
suspended and the other cancelled. Another operator's registered-only
reprocessor is approved, uploads once the quarter closes and files its
quarterly report. With the stack up on the clock:

```bash
npm run simulate:exercise
```

It moves the clock forwards from January, so a stack already past that date
has to be brought up again first.

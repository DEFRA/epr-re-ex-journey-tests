# Executing events

Carries out the operator, summary log, report and PRN events the calendar
plans, against the service through the seeders the specs already use, under
the simulated clock. The runner moves the clock and hands events over; this
module does each one.

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
and numbers, who is signed in, every upload a registration has made so far,
and every note it has drafted, by the plan's `prnId`. Hand one operator's
events over in calendar order. Events of different operators are independent
of each other.

`executeEvent` refuses an event type it has no executor for, by name, so a
calendar that emits something new stops rather than skipping it.

## What each event does

| Event                        | Against the service                                                                                                                                                                                                                                                                        |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `registration.approved`      | The first time for an operator: applies for the organisation with every registration and accreditation the population gave it, and links a Defra ID user. Every time: approves that registration and its accreditation, granting their numbers, and registers an exporter's overseas site. |
| `accreditation.suspended`    | Suspends the accreditation.                                                                                                                                                                                                                                                                |
| `accreditation.cancelled`    | Cancels the registration, which the service cascades to the accreditation.                                                                                                                                                                                                                 |
| `summary-log.uploaded`       | Sends the rows `uploadRows` gives for it as content through the dev route, which validates and submits them in one request and answers with the document. An upload the route cannot express is not made: see below.                                                                       |
| `report.submitted`           | Creates, fills and submits the period's report.                                                                                                                                                                                                                                            |
| `prn.drafted`                | Waits for the accreditation's waste balance to hold the tonnage the plan gives the note, then drafts it for that.                                                                                                                                                                          |
| `prn.discarded`              | Moves the note to `discarded`.                                                                                                                                                                                                                                                             |
| `prn.raised`                 | Moves it to `awaiting_authorisation`, which is when the service draws its tonnage from the balance.                                                                                                                                                                                        |
| `prn.deleted`                | Moves it to `deleted`, which credits the tonnage back.                                                                                                                                                                                                                                     |
| `prn.issued`                 | Moves it to `awaiting_acceptance`. The service numbers it here, and the producer's events use that number. The run keeps when, for the period's report.                                                                                                                                    |
| `prn.accepted`               | Accepts it as the producer, through the external API under the Cognito stub.                                                                                                                                                                                                               |
| `prn.cancellation-requested` | Rejects it as the producer, through the external API, leaving it `awaiting_cancellation`.                                                                                                                                                                                                  |
| `prn.cancelled`              | Moves it to `cancelled`.                                                                                                                                                                                                                                                                   |

A summary log that comes back other than planned stops the run: a fatal
rejection has to come back `invalid` reporting the issue the plan planted by
its code, and a landed upload `submitted` with no issue beyond a warning.

The route validates and submits in one request, so it cannot leave a log
validated and unsubmitted. The calendar still plans an upload rejected for an
error on a row, an abandoned draft and an unreadable workbook, and the
executor makes none of them. `expectedOutcome` is null for those, and the
calibration summary counts them out of its upload figures and their targets.

## What the operator types into a report

The service aggregates a report's activity from the summary log. What is left
is typed here:

| Registration            | Fields                                                          |
| ----------------------- | --------------------------------------------------------------- |
| Reprocessor, accredited | tonnage recycled and not recycled, PRN revenue and free tonnage |
| Reprocessor, registered | tonnage recycled and not recycled                               |
| Exporter, accredited    | PRN revenue and free tonnage                                    |
| Exporter, registered    | tonnage received but not exported                               |

Tonnage recycled is what the calendar planned on the report event; a
reprocessor's report that carries none stops the run. PRN revenue is what the
notes issued in the period fetched, their tonnage at the price the plan gave
each, and free tonnage is the tonnage of any issued at no price. The rest is
zero: nothing planned is not recycled or not exported.

## What a note is for

The plan says when a note is drafted, what becomes of it and what it carries,
drawn so the balance the uploads have built can fund it. The service builds
that balance after each submission and refuses a draft over it, so a draft
waits for the balance to hold the tonnage; a balance that never gets there
means the plan and the service disagree, and the run stops. Creating a draft
reserves nothing; the balance is drawn when the note is raised, and credited
back when it is deleted or cancelled. The producer it is issued to is the
seeders' fixed test organisation.

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
go through approval, a submitted upload, a note taken off each of the three
exits (discarded, deleted, cancelled) and one accepted while another is in
flight, a report, one upload of every rejection kind, an abandoned one, a
second submitted upload restating the closed month, that month's
resubmission, a note left awaiting the producer, and the next report, then one
is suspended and the other cancelled. Another
operator's registered-only reprocessor is approved, uploads once the quarter
closes and files its quarterly report. With the stack up on the clock:

```bash
npm run simulate:exercise
```

It moves the clock forwards from January, so a stack already past that date
has to be brought up again first.

# Event calendar

Plans when everything happens: a timestamped list of events per operator across
the period, on the population and the planned rows. Summary log uploads and what
became of each, reports filed against the deadline or missed, the PRN lifecycle,
and the day an accreditation was suspended or cancelled.

Pure and seeded: nothing here calls an API, reads a clock or touches the
filesystem, and the same seed and period always give the same events.

```js
import { planPopulation } from '../population/population.js'
import { planSummaryLogRows } from '../rows/rows.js'
import { planCalendar, uploadRows } from './calendar.js'
import { EVENT } from './events.js'

const population = planPopulation({ seed: 'run-42', scale: 0.1 })
const rows = planSummaryLogRows({ population })
const calendar = planCalendar({ population, rows, to: '2026-09-18' })
```

| Setting       | Default                        | What it does                                                              |
| ------------- | ------------------------------ | ------------------------------------------------------------------------- |
| `population`  | required                       | The planned population.                                                   |
| `rows`        | required                       | The planned rows its uploads draw on.                                     |
| `from`        | the day the register went live | ISO date. The first day anything happens.                                 |
| `to`          | today                          | ISO date. The last day anything happens; a period still open is not owed. |
| `calibration` | `DEFAULT_CALIBRATION`          | Every figure the plan is built from, as the population planner uses.      |

`to` is the one default read off the clock, so a caller that wants a plan to
replay on another day passes it.

## What comes back

```js
{
  seed, from, to,
  operators: [ { organisationId, events: [ /* CalendarEvent */ ] } ]
}
```

Each operator's events are in the order they happen. Every event carries `type`,
`at` (an ISO timestamp inside working hours), `organisationId` and, where it
concerns one registration, `registrationId`. The types are enumerated in
`events.js`, which is the one place an executor implements against: handle every
member of `EVENT` and nothing the calendar plans is missed.

| Event                        | What happens                                                                              | Also carries                                                             |
| ---------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `registration.approved`      | The registration, and the accreditation the population gave it, go live as planned there. |                                                                          |
| `accreditation.suspended`    | The regulator suspends the accreditation.                                                 |                                                                          |
| `accreditation.cancelled`    | The regulator cancels the accreditation, and the registration with it.                    |                                                                          |
| `summary-log.uploaded`       | A workbook is uploaded. See "An upload".                                                  | `cutoff`, `outcome`, `issues`, `amendments`, `restated`, `closedPeriods` |
| `report.submitted`           | A report for one period is created and submitted.                                         | `year`, `cadence`, `period`, `submissionNumber`                          |
| `prn.drafted`                | The operator saves a draft note.                                                          | `prnId`, `tonnage`, `pricePerTonne`                                      |
| `prn.discarded`              | The operator discards the draft.                                                          | `prnId`, `tonnage`, `pricePerTonne`                                      |
| `prn.raised`                 | The operator raises it for authorisation.                                                 | `prnId`, `tonnage`, `pricePerTonne`                                      |
| `prn.deleted`                | The signatory deletes it instead.                                                         | `prnId`, `tonnage`, `pricePerTonne`                                      |
| `prn.issued`                 | The signatory authorises it, and it awaits the producer.                                  | `prnId`, `tonnage`, `pricePerTonne`                                      |
| `prn.accepted`               | The producer accepts it.                                                                  | `prnId`, `tonnage`, `pricePerTonne`                                      |
| `prn.cancellation-requested` | The producer asks for it to be cancelled instead.                                         | `prnId`, `tonnage`, `pricePerTonne`                                      |
| `prn.cancelled`              | The signatory confirms the cancellation.                                                  | `prnId`, `tonnage`, `pricePerTonne`                                      |

A registration's events start with its approval, on the day it went active or
the first day of the period if that is later, and carry a status change if the
population ended it suspended or cancelled. The population states only where
each accreditation ended up; the day is drawn here, at least a month into the
registration's year. A cancellation ends everything: a registration is
cancelled exactly where its accreditation is, so one event carries both, and
nothing is planned after it. A suspension ends only the notes: a suspended
accreditation is still accredited, so it keeps recording loads and owes its
monthly reports. An accreditation that runs out stops recording loads on its
last day, but the uploads and reports for what it did carry on to `to`, so a
period that ended with the accreditation is still filed.

`prnId` ties the events of one note together and is the plan's own identifier,
not the number the service assigns. Every event of a note carries the same
`tonnage`, in whole tonnes, and `pricePerTonne`, in pounds; see "PRNs" for how
they are drawn.

## An upload

A summary log is cumulative and answers no calendar. An upload restates every
load to date, so the plan treats one as a view of the row plan rather than as
state: every row dated up to `cutoff`, which is the day of the upload, with the
amendments of it and every submitted upload before it laid over them.
`uploadRows` renders that view; hand it the registration's upload events up to
and including the one to render, in order.

```js
const registration = rows.registrations.find(
  (planned) => planned.registrationId === 'OP-0001-R1'
)
const uploads = calendar.operators[0].events.filter(
  (event) =>
    event.type === EVENT.SUMMARY_LOG_UPLOADED &&
    event.registrationId === 'OP-0001-R1'
)
const rendered = uploadRows({ registration, uploads: uploads.slice(0, 3) })
```

What comes back is the row list `rowsForUpload` in the rows module takes.

| Field           | Meaning                                                                                                                                         |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `cutoff`        | The last day of loads the workbook carries. Never earlier than the upload before.                                                               |
| `outcome`       | `submitted`, `rejected` (came back with issues) or `abandoned` (validated, never submitted). Only a submitted upload changes what is on record. |
| `issues`        | On a rejected upload, its `severity`, `kind` and the `rows` it is planted on. Null otherwise.                                                   |
| `amendments`    | How many rows submitted before are restated with changed cells, and the seed that draws which. Null on a first upload.                          |
| `restated`      | Rows in a period whose report was already submitted, which the service reads as a restatement of that period.                                   |
| `closedPeriods` | The months whose report was submitted before this upload, so amendments are drawn from the rest.                                                |

Each reporting period gets the profile's `uploads.perReportingPeriod` uploads,
varied by up to the difference between that and one. The last of them closes the
period: it lands after the period ends and before its report, so the report
aggregates the period's rows. The rest fall inside the period. An upload that
would carry no rows at all is not made.

Before an upload lands it may take several goes on the same day: an abandoned
draft at `uploads.abandonRate`, and at `uploads.rejectionRate` as many rejected
attempts as `uploads.extraAttemptsWhenRejected`. Every attempt carries the same
workbook and the landing one is clean.

A rejection is fatal at `uploads.fatalShare` and an error on rows otherwise;
which of each the calibration's `uploadIssueKinds` decides. Each kind is the
plan of a workbook that provokes one validation code the service raises:

| Kind         | Severity | What the workbook does                                           | Code raised               |
| ------------ | -------- | ---------------------------------------------------------------- | ------------------------- |
| `removedRow` | fatal    | Omits rows submitted before. Only ever after a first submission. | SEQUENTIAL_ROW_REMOVED    |
| `unreadable` | fatal    | Cannot be read at all; pass `unreadable` to the generator.       | SPREADSHEET_INVALID_ERROR |
| `badDate`    | fatal    | Puts text where a row's date should be.                          | INVALID_DATE              |
| `blankField` | error    | Leaves the date of a row blank.                                  | FIELD_REQUIRED            |

An error sits on rows the upload adds where it adds any, because that is where
an operator's new mistakes are, and only on a worksheet the service reads into
the waste balance, because those are the only rows it validates the cells of.
A workbook with none of those to plant on is rejected fatally instead, so a
registered-only registration's rejections are all fatal.

Amendments are the calibrated `rowsPerSubmission[stream].updated`, a month's
worth like the rows an upload creates, times the operator's volume factor and
spread across the uploads a period gets. They are drawn from rows submitted
before in periods still open, so an amendment is an adjustment and never an
accidental restatement, and an upload with fewer such rows than that amends
what there are. An amended row keeps every pinned cell and draws the
rest afresh, and stays amended in every later upload, because a row that moved
back would read as a second adjustment.

## Reports

A report is the per-period aggregation a summary log submission triggers, and a
separate act from the upload. Each period a registration was active for is owed
once it has ended: monthly if it is accredited and quarterly if it is
registered only. `cadenceOf` is that rule.

The day is drawn from the profile's punctuality against the calibration's
`punctuality.dueDay` of the month after the period: on time, or up to a week,
a month or three months late, with `reporting.earlyShare` of the on-time ones
more than ten days early. A return is missed altogether at
`reporting.missedReturnRate`, and one that would land after `to` is not filed
yet rather than missed.

A period is closed the moment its report is submitted, and only then: an upload
that restates a row in a closed period is what the service reads as a
restatement of it, and reopens it for resubmission. At
`reporting.restatementRate` a report is followed by exactly that: the next
submitted upload carries one of the period's rows in `restated`, and a second
`report.submitted` with `submissionNumber` 2 follows within a fortnight.

## PRNs

Each accredited registration drafts `activity.prnsPerAccreditationPerMonth`
notes a month, times the operator's volume factor, spread evenly either side of
that, from the day after its first summary log is submitted: a note is issued
against the balance the uploads have built, so none comes before it. A note is
raised the day it is drafted and issued within three days, then accepted at
`prn.producerAcceptRate`, in the month of issue at
`prn.sameMonthAcceptanceShare` and the month after otherwise, or left awaiting
acceptance. The exits are drawn where they happen: discarded as a draft at
`prn.discardRate`, deleted at authorisation at `prn.deleteRate`, and at
`prn.cancelRate` the producer asks for a cancellation within ten days of issue
and the signatory confirms it within three.

What a note carries is drawn from the balance the plan can see. A month's
notes have between them `activity.prnIssuedShare` for the processing type of
the tonnage the registration's submitted uploads have credited by the end of
the month, less what earlier notes took, scaled up by the operator's discard
and delete rates because those notes never reach issue, so over the year the
registration issues that share of what it credits, a month or so behind. Each
note takes a weighted part of that, in the order the notes are drafted, and
never more than the balance holds on its day: what is credited and on record,
less what is debited, less every note holding tonnage that day. A note draws
the balance when it is raised and gives it back when it is deleted or
cancelled, and one that would carry under a tonne is not planned at all, so
the plan never asks for a note the balance cannot fund. A credit the service
dates in December is left alone, because it is kept for a December note,
which none of these is: an exported load is dated by the day the overseas
reprocessor received it, which the sheet declares as its `balanceDate`, and
any other by the row's own day. Tonnage is in whole tonnes; the price is the
calibration's `activity.prnPricePerTonne` for the registration's material,
and a material it prices nothing for is refused rather than planned free.

## Weekends and working hours

An operator whose profile has `worksWeekends` false does nothing on a Saturday
or Sunday: a day drawn on one moves to the nearest working day that keeps it
inside the range it was drawn in, so a return drawn on time stays on time.
Where a range holds no working day, which is one of a weekend or less, nothing
is planned in it. A weekend worker's days are drawn evenly, so two sevenths of
what it does lands at the weekend. A status change is the regulator's and lands
on a working day for everyone.

Every timestamp falls between 08:00 and 18:00 UTC. Events of one registration
keep the order the plan drew them in, later on the same day if only by a
second, and no two of them share a moment.

## Where the numbers come from

As with the other planners, this one holds no figures of its own. Rates come
from each operator's profile and volumes from the calibration; `calibration.js`
says which are read off a published source and which are nominal. The spacings
that are mechanics rather than behaviour, such as the three days a PRN takes to
move a step, are constants at the top of `calendar.js`.

`calendar.test.js` holds the estate to the calibration at full scale: uploads a
month, amendments an upload, rejections and what they are for, punctuality and
missed returns, restatements, PRNs per accreditation and per material, the
tonnage they carry against what the estate credits, and the transition rates. Punctuality is against the 21st the guidance gives and the
research measured against; the service's own calendar marks the 20th, so a
return filed on the 21st is on time here and a day late there. A rate the profile spreads unevenly across the archetypes, such as how
fatal a rejection is, is held to the mean of the profile rate over the events
it applies to rather than to the calibration, because a tardy operator has more
rejections to be fatal.

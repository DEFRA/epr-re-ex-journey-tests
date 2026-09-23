# Summary log rows

Plans every summary log row a population reports across a year: which template
each registration files on, how many rows each month carries, what tonnage each
one moves, and the cells that decide whether it moves any at all.

Pure and seeded: nothing here calls an API, reads a clock or touches the
filesystem, and the same seed always gives the same rows.

```js
import { planPopulation } from '../population/population.js'
import { planSummaryLogRows, rowsForUpload } from './rows.js'

const population = planPopulation({ seed: 'run-42', scale: 0.1 })
const plan = planSummaryLogRows({ population })
```

| Setting       | Default                     | What it does                                                         |
| ------------- | --------------------------- | -------------------------------------------------------------------- |
| `population`  | required                    | The planned population these rows belong to.                         |
| `year`        | the register's go-live year | The calendar year to plan.                                           |
| `calibration` | `DEFAULT_CALIBRATION`       | Every figure the plan is built from, as the population planner uses. |

## What comes back

```js
{
  seed, year,
  registrations: [ /* PlannedRegistrationRows */ ]
}
```

| Field            | Meaning                                                                                                     |
| ---------------- | ----------------------------------------------------------------------------------------------------------- |
| `registrationId` | The registration these rows belong to.                                                                      |
| `organisationId` | The operator it belongs to.                                                                                 |
| `stream`         | Which of the generator's five templates it files on. See "Input, output and registered only".               |
| `overseasSite`   | `{ id, validFrom }` for an exporting registration, `null` otherwise. See "What a row needs from around it". |
| `rows`           | The whole year, in the order the log requires: month by month, and within a month worksheet by worksheet.   |

A row:

| Field          | Meaning                                                                                                                                                                                    |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `rowId`        | The `ROW_ID` it carries. Unique within its worksheet and only ever climbing through the year.                                                                                              |
| `worksheet`    | The worksheet it is rendered into, named as the template names it.                                                                                                                         |
| `period`       | The month it belongs to, `YYYY-MM`.                                                                                                                                                        |
| `date`         | The day it happened, ISO. Every date cell it pins is this day or an offset from it.                                                                                                        |
| `contribution` | `credit`, `debit` or `none` — what it does to the registration's waste balance.                                                                                                            |
| `tonnage`      | What it moves on the balance, held to the two decimals the service keeps. Sum it in decimal, as the service does. `0` on a worksheet the service never classifies, and on an excluded row. |
| `fields`       | Cells to pin, keyed by template marker.                                                                                                                                                    |
| `seed`         | Draws every cell the plan leaves alone, so the row renders identically every time it is uploaded.                                                                                          |

`rowsForUpload(rows)` hands a selection of them to `generateSummaryLogContent`
in the shape it takes, keyed by worksheet. Pass whichever rows an upload carries;
that choice is the calendar planner's.

## Why a row is pinned at all

A row must render identically every time it is uploaded, or an amendment reads
as a wholesale restatement: the service compares each field against what it held
before, so a second upload restating one row comes back with every row adjusted.
The seed is half of that and the dates are the other half — a date the generator
draws relative to now moves with the simulated clock even under a fixed seed. A
plan can only hold a date still by naming it, so every date marker a template
carries is pinned, including one whose value is empty because the row never
needed it.

## What a row has to carry to count

Only four of the thirteen worksheets reach a waste balance at all:

| Stream              | Worksheet                      | What it does |
| ------------------- | ------------------------------ | ------------ |
| `exporter`          | Exported (sections 1, 2 and 3) | credits      |
| `reprocessorInput`  | Received (sections 1, 2 and 3) | credits      |
| `reprocessorInput`  | Sent on (sections 5, 6 and 7)  | **debits**   |
| `reprocessorOutput` | Reprocessed (sections 3 and 4) | credits      |

Everything else is reported and read back but never classified, so tonnage
planned into one is reported and moves no balance.

A row on one of those four is excluded unless it says so. Left to the
generator's own uniform draws, almost none of them count:

- **A note already issued** against the waste excludes the row, on both the
  exporter and the reprocessor input credit paths. Drawn evenly, that is half of
  every credit row.
- **Stopped or refused waste** excludes an exported row. These two are checked
  before the overseas site is even looked up, so drawn evenly they exclude three
  rows in four and leave the site checks untested.
- **Not adding the product weight** excludes a reprocessed output row. It tests
  not-yes rather than no, so a blank or a leftover dropdown placeholder excludes
  the row as firmly as an explicit no does.
- **An interim site** moves what an exported row credits onto a different cell,
  so a plan that pins one tonnage column and not the flag controls the balance on
  only half its rows.

## What a row needs from around it

Two exclusions are not this planner's to close, because they depend on what the
executor creates before the upload:

- **The overseas site has to exist.** An exported row names one, and the service
  excludes the row where the registration has no such site. `overseasSite` on
  each exporting registration is the site to create.
- **Its approval has to cover the export date.** `overseasSite.validFrom` is the
  earliest date the plan uses, so a site registered from that day covers the
  whole year.

The exporter path skips the site block entirely when the overseas sites value is
the validation-disabled sentinel. That would make the rows count and would stop
the simulation exercising what production exercises, so it is not a fix.

## The arithmetic the service recomputes

A tonnage cell cannot simply be pinned. The service recomputes the net weight
from the gross, tare and pallet weights, and the tonnage from the net weight,
the non-target weight, the bailing wire protocol and the recyclable proportion,
and **rejects the whole upload** where either disagrees. The reprocessed output
proportion is checked against the product tonnage and its percentage the same
way.

So the plan works forwards: it picks the weights, computes what they carry, and
reports that as the row's tonnage. A test that asserts on the pinned cell alone
and not on what derives from it will not catch a plan that pins around the
arithmetic rather than through it.

## Input, output and registered only

The population plans a registration as exporting or reprocessing and leaves the
rest here, so this is the one place that decides which of the generator's five
templates a registration files on:

| Registration                  | Stream                                    |
| ----------------------------- | ----------------------------------------- |
| Exporting, accredited         | `exporter`                                |
| Exporting, registered only    | `regOnlyExporter`                         |
| Reprocessing, accredited      | `reprocessorInput` or `reprocessorOutput` |
| Reprocessing, registered only | `regOnlyReprocessor`                      |

The input and output split is a quota rather than a draw, so every scale lands
on the calibrated share rather than drifting from it on a small run.

## Dates, and the window they have to sit in

A registration reports from the month it went active to the end of its
accreditation window, and every date a row pins sits inside that window. A row
dated outside it is ignored rather than counted, and over a simulated year that
is the likeliest way for a whole period's tonnage to vanish — it presents as a
tonnage bug rather than a planning one.

An accreditation that is suspended or cancelled is a separate matter. The
window itself never moves, but a date after the status changed is excluded, and
when that change happened is the event calendar's to decide. So the months stop
on the day the calendar's `lastLoadDay` gives for it, and no row pins a date
after that. A suspended registration's rows run to the day of the suspension,
which still counts because the change takes effect later that day. A cancelled
registration's rows stop the day before, because it uploads nothing on the day
it is cancelled.

A registration with no accreditation at all is not excluded on the window: the
service treats a null accreditation as accredited throughout.

## Where the numbers come from

As with the population, this planner holds no production figure of its own.
`activity.summaryLogSheets` on the calibration gives each worksheet its share of
an upload's rows and the tonnage the whole UK reports through it in a month,
and `activity.rowsPerSubmission` gives the rows an upload carries.

**Rows** are the calibrated rows-per-submission for the stream, times the
operator's volume factor, spread across the stream's worksheets. A registration
answers one monthly return, so a month's worth is one upload's worth; how many
uploads carry them is the calendar planner's to decide.

A worksheet the calibration names and the templates do not, or the other way
round, is refused rather than silently planning no rows for it. So is a monthly
tonnage on a worksheet whose rows carry no load, such as the input template's
reprocessed worksheet, rather than silently planning rows that carry none of it.

**Tonnage per row** is not calibrated directly. It is whatever makes the
estate's year land on the tonnage the calibration reports for that worksheet,
scaled with the population so a tenth-scale run credits a tenth of it. It
follows that raising the rows a submission carries shrinks the load behind each
row rather than inflating the year's tonnage.

A registration's months are not all the same. Each month is scaled by a factor
drawn within `MONTHLY_VARIATION` of one, and the factors are brought back to an
average of exactly one across that registration's months, so a month read on
the regulator pages varies as production does while the registration's year,
and the estate's, still lands where the calibration puts it.

The reprocessor figures are the whole reprocessor estate's, and the input and
output streams are two ways one estate reports the same process, so each
stream lands on the share of a figure its registrations are of that estate, by
registration-months. The two streams credit the national tonnage once between
them, and report the tonnage received and the tonnage sent on once between
them, with the input stream's sent-on share the only part of it that debits.

Only a worksheet the calibration gives a monthly tonnage is anchored that way.
Every other worksheet's weights are whatever the generator draws from the
row's seed. They
hold still and they validate, and they are not a production quantity: summing
tonnage received or product tonnage across the estate reports the fixture, not
the country.

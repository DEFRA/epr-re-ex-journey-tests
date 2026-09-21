# End-of-run calibration summary

Shows what a run generated next to what its calibration asked for, and the
ratio between them, for the shape of the estate and a year of its activity.
`simulate.js` prints it when a run completes. To print it for a run directory
at any time, part way through a run included:

```bash
npm run simulate:summary -- --dir test-artifacts/simulator/pepr
```

It replans the run from its saved settings, so it has to run under the same
`SIMULATOR_CALIBRATION` as the run did and refuses otherwise, and reads what
the service holds through the same APIs the admin frontend uses. The stack
the run was made against has to be up.

## What the targets are

Every target is the calibration the run was planned with, scaled to the run,
and never a figure from anywhere else. A run with the production overlay
loaded measures against production without the code carrying a production
number.

- A register count, such as organisations by type or accreditations by
  tonnage band, is the calibration's count times the run's `scale`, so it is
  usually not a whole number. It is the whole run's register, so a run
  summarised part way through shows what its approvals have reached so far.
- An activity rate is applied to the registrations the run holds, each at
  the rate its operator's profile spread the calibration into. Under the
  `production` mix those profiles average back to the calibration exactly;
  under another mix the target follows the mix, as the plan does.
- A monthly figure counts the registrations that owe the month: active by
  its end, and not cancelled before it began. A registered-only registration
  owes a third of its quarterly rate each month. The rate is a steady state:
  the calendar lands a period's closing upload with its report, so a month
  can read a little under or over as the closing uploads fall either side of
  it, and the run's last month reads light.
- Notes are expected from the month of the day after a registration first
  submitted a summary log, which the calendar gives a whole month's notes
  however late in it that day falls, and stop with a suspension or
  cancellation.

## Where the generated figures come from

Each section says. The service is read wherever it has a view:

| Section                                               | Read from                                                                                                 |
| ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Every estate section, organisations down to sites     | Each organisation the run made, by id                                                                     |
| Submitted and invalid summary logs a month            | The summary log list of each registration, which carries what was submitted and what was refused outright |
| Reports against their due day, missed and resubmitted | The report submissions feed, one row per period per registration, blank where nothing was submitted       |
| Notes drafted a month                                 | The admin list of notes, by the day each was created                                                      |
| Note transitions a month                              | The system log of status changes, by the day each was recorded                                            |

Two figures the service holds but does not list come from the executed plan,
read off the journal: every upload attempt, because the executor makes no
upload the route cannot express (see `../execute/README.md`) and those are not
in the list, and amended rows, because the service keeps a row's latest state
and no count of how many times it changed.

A report's lateness is against the calibration's due day, the 21st, rather
than the 20th the service's own calendar marks, so the shares compare with
the calibration they were measured for. Only periods due ninety or more days
before the day the run reached are counted, which is as late as the calendar
plans a return, so an unfiled period is missed rather than not yet filed.

The feed lists more periods than the calendar plans returns for, and only
the planned ones count: it starts a registration with no active
accreditation at the beginning of the year, whatever day it went active,
and it lists a registration whose accreditation has been cancelled as
quarterly from then on, so that registration's monthly returns leave the
feed and its lateness is not measured. The feed lists every period of the
year the stack's clock stands in, and an earlier year's period only where a
report was submitted for it, so only that year's periods count and a run
crossing a year end is measured over its last year.

## Reading it

A ratio of 1 is on target. A small run keeps the categorical shapes and loses
the size tail, so the register counts a tenth-scale run shows are one or two
either side of a fractional target rather than on it; the shape is what to
read. Two deviations are known and accepted: the Annex II R4 process lands a
few registrations above its share, because an organisation holding several
materials has to register the rarer ones, and the per-organisation counts of
a small run have no eight-registration, four-site or six-material
organisation, because nothing puts a rare size back the way the status quota
puts a rare status back.

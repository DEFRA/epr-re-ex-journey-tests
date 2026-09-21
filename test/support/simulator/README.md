# Simulating a year of operator activity

The simulator fills a local stack with a year of reprocessor and exporter
activity shaped like production: operators applying and being approved,
summary logs uploaded and rejected, reports filed late and on time, PRNs
drafted, issued, accepted and cancelled. Everything goes through the
service's own APIs under a simulated clock, so what you get is what a year of
real use would have left behind, at whatever fraction of the register you ask
for.

The simulator lives on the `PAE-1979-simulator-integration` branch until it
lands on `main`. Check that branch out to follow this guide.

This is the walk from a fresh checkout to a signed-in operator with a
tenth-scale year of data behind them. Each module under this directory has
its own README with the depth; this page says which one to open.

## 1. Bring the stack up on the clock

The stack is the same `compose.yml` the journey tests use, with the
`compose.clock.yml` overlay at the repo root, which puts every Node container
on the simulated clock and stops Mongo reaping records whose simulated expiry
is in the real past. With the Node the root README asks for, from the repo
root:

```bash
npm install
docker compose pull epr-backend epr-frontend epr-re-ex-admin-frontend
docker compose -f compose.yml -f compose.clock.yml up -d
```

The simulator submits summary logs through a dev route on epr-backend.
`compose.yml` switches it on with `FEATURE_FLAG_DEV_ENDPOINTS`, and the image
has to be built from epr-backend commit 868afcced or later to carry it, which
is what the `pull` above is for: an older `latest` answers the route with a
404 on the run's first upload.

Without the overlay the containers stay on real time while the run moves its
own clock, and the year lands on today's date.

A stack that has already run a simulation holds records stamped with that
run's dates, so bring it down and up again between runs.

`clock/README.md` says what the overlay does and what the clock does not
reach.

## 2. Run a tenth-scale year

```bash
npm run simulate -- --scale 0.1
```

A fresh run takes the clock off, plans the year, then replays it day by day,
logging a JSON line per event whose `msg` is the simulated instant, the
registration, the event, how long it took and a running count:

```
2026-03-04T12:59:50.000Z  OP-0009-R2  summary-log.uploaded  0.0s  (544/2873)
```

It ends with the calibration summary. On a laptop the tenth-scale year above
took five and a half minutes on 21 September 2026: 29 operators, 2,873
events, most of the time in summary log uploads. Time goes with the event
count, which at full scale is 32,227 for 293 operators, so an hour or so by
that rate; `--concurrency` is the lever, and the stack, not the simulator, is
where the time goes.

The run keeps its settings, journal and manifest in
`test-artifacts/simulator/<seed>/`, which is gitignored.

### The settings

| Flag            | Default                           | What it does                                                                                                               |
| --------------- | --------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `--seed`        | `pepr`                            | Any string. The same seed and settings always plan the same population, rows and calendar, so a run is repeatable.         |
| `--scale`       | `1`                               | The fraction of the register to simulate. `1` is the whole register the calibration describes; `0.1` is a tenth of it.     |
| `--from`        | the day the register went live    | ISO date. The first day anything happens.                                                                                  |
| `--to`          | today                             | ISO date. The last day anything happens. A reporting period still open on that day is not owed.                            |
| `--profile-mix` | `production`                      | Which behaviour mix the operators are drawn from. See below.                                                               |
| `--concurrency` | `4`                               | How many operators act at once within a simulated day. Raise it to run faster; the stack, not the simulator, is the limit. |
| `--dir`         | `test-artifacts/simulator/<seed>` | Where the run keeps its settings, journal and manifest. Use another to keep two runs side by side.                         |

Scale does not change the shape of the estate, only its size: a tenth-scale
run still has every material, agency, tonnage band and accreditation status
the register does, in proportion, with at least one of each rare status so
there is always a suspension and a cancellation to look at. What a small run
loses is the size tail, the eight-registration organisation and the like.

The figures every run is planned from are the calibration, a committed set
derived from the public register and the GOV.UK monthly aggregated workbook.
To plan against measured figures instead, point `SIMULATOR_CALIBRATION` at an
overlay file named `simulator-calibration*.json`, which `.gitignore` keeps
out of the repository; `population/README.md` says what it may contain.

### Profiles and the mix

Every operator carries a behaviour profile: an archetype (`punctual`,
`typical` or `tardy`) that sets how it reports, uploads and handles PRNs, a
volume factor from its tonnage band, and whether it works weekends. The
profile is the disposition; the calendar draws each event against its rates,
so two operators on the same archetype still behave differently over a year.

`--profile-mix` picks how the archetypes are shared out:

| Mix          | Use it for                                                                                                    |
| ------------ | ------------------------------------------------------------------------------------------------------------- |
| `production` | The default. The estate averages back to the calibration exactly, so the summary reads against target.        |
| `punctual`   | A cleaner dataset: late and missed returns, rejections and abandoned drafts at a third of the estate's rates. |
| `chaotic`    | The defect paths: rejected uploads, abandoned drafts, late and missing returns, deleted and cancelled PRNs.   |

The mixes are `PROFILE_MIXES` in `population/profiles.js`, one line each, and
a new one is another line there. Every rate a profile carries, and what it
means, is tabled in `population/README.md`.

Three of the defect paths are planned and counted but never reach the
service: an upload rejected for an error on a row, an abandoned draft and an
unreadable workbook, none of which the dev route can express.
`execute/README.md` says what each event does against the service.

### Stopping and resuming

`Ctrl-C` once. The events under way finish and are journalled, the manifest
is written, and the run exits 130. An upload can take a minute, so give it
that; a second `Ctrl-C` cuts the events in flight off unjournalled and they
are done again on resume, which for an approval means a second organisation
for the same planned operator.

Run the same command again to resume: the run carries on from the first
event not yet done, against the same stack. It refuses a different seed,
scale, period, profile mix or calibration from the one it was planned with;
concurrency can change. To start over, use another `--dir` or delete the
directory, against a stack brought up fresh. `run/README.md` has the detail,
including what a run that stopped on a failed event leaves behind.

## 3. Sign in as an operator

`manifest.json` in the run directory names every operator the run made, with
the reference number and six-digit organisation id the service gave it, its
registrations with their numbers, and the Defra ID user linked to it:

```bash
jq '.operators[0] | {id, refNo, orgId, signIn, registrations: [.registrations[] | {id, stream, material, regNumber, accNumber}]}' \
  test-artifacts/simulator/pepr/manifest.json
```

Open the frontend at <http://localhost:3000/start> and press "Start now". It
sends the browser to the Defra ID stub's sign-in page at `localhost:3200`;
enter the manifest's `signIn.email` and no password. You land on the
operator's home page, and each registration's PRNs, reports and waste balance
are the year the run replayed.

The stub keeps its users in Redis, so they outlive the run but not the
containers: after a `docker compose down` the manifest still names them and
the stub no longer knows them, and the stack no longer holds their data
either.

The admin frontend at <http://localhost:3002> shows the same operators from
the regulator's side. It signs in through the Entra stub; `ea@test.gov.uk`
with the password `pass` is the regulator the admin specs use.

## 4. Read the summary

A completed run prints the calibration summary: every figure the run
generated next to what its calibration asked for at that scale, and the
ratio, section by section. It opens with the run and how far it got, then
the shape of the estate (organisations by type, registrations by material
and agency, accreditations by band and status), then a year of activity
(summary logs a month per stream, reports against their due day, notes a
month and by material):

```
# pepr at scale 0.1, 2026-01-01 to 2026-09-21: 2873 of 2873 events executed, reached 2026-09-21

## Reports against their due day
Generated from the service's report submissions feed, over the 157 periods due 90 or more days before 2026-09-21.

                                     share  target  ratio
on time                               0.74    0.72   1.02
late within 7 days                    0.06    0.10   0.67
late within 30 days                   0.10    0.11   0.86
late beyond 30 days                   0.10    0.07   1.49
on time and more than 10 days early   0.14    0.19   0.72
missed                                0.01    0.01   0.63
resubmitted                           0.04    0.05   0.89
```

A ratio of 1 is on target. On a tenth-scale run the register counts sit one
or two either side of a fractional target; the shape is what to read, and
`summary/README.md` says where each figure comes from and which deviations
are known and why.

To print it again, or for a run part way through, with the stack still up:

```bash
npm run simulate:summary -- --dir test-artifacts/simulator/pepr
```

## Moving the clock yourself

The run moves the clock for you. To see the stack on a later day,
`npm run clock -- <date>` moves every container there within a quarter of a
second. Only ever move forwards: after the walk above the stack stands on the
run's last day, so a date before that is a jump backwards, which nothing in
the stack expects. Anyone signed in has to sign in again after a jump of more
than an hour, because their token has expired under them.
`npm run clock -- off` hands the stack back to real time, which is itself a
jump backwards; it ends the run, so bring the stack down rather than carrying
on against it.
`clock/README.md` covers what the clock reaches and what it does not.

## Where the pieces are

| Directory     | What it does                                                                                     |
| ------------- | ------------------------------------------------------------------------------------------------ |
| `clock/`      | The `--require` preload that replaces `Date`; `compose.clock.yml` at the root mounts it.         |
| `population/` | Plans the operators, their registrations and accreditations, and each one's behaviour profile.   |
| `rows/`       | Plans the summary log rows each registration will upload over the year.                          |
| `calendar/`   | Plans when everything happens: a timestamped event list per operator.                            |
| `execute/`    | Carries each event out against the service through the seeders the specs use.                    |
| `run/`        | The `npm run simulate` entry: replays the calendar under the clock, journals, resumes, manifest. |
| `summary/`    | The end-of-run calibration summary.                                                              |

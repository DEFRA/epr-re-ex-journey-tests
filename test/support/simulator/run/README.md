# Running the simulator

Plans a population, its rows and its calendar, then replays the calendar
against the local stack under the simulated clock: the clock moves to each
day anything happens, and that day's events go to the executors. A run leaves
a journal it can resume from and a manifest of what it made.

Bring the stack up on the clock (see `../clock/README.md`), then:

```bash
npm run simulate -- --scale 0.1
```

| Flag            | Default                           | What it does                                                                      |
| --------------- | --------------------------------- | --------------------------------------------------------------------------------- |
| `--seed`        | `pepr`                            | The population, rows and calendar replay the same for the same seed and settings. |
| `--scale`       | `1`                               | `1` is the whole register the calibration describes. `0.1` is a tenth of it.      |
| `--from`        | the day the register went live    | ISO date. The first day anything happens.                                         |
| `--to`          | today                             | ISO date. The last day anything happens.                                          |
| `--profile-mix` | `production`                      | Which behaviour mix the operators are drawn from.                                 |
| `--concurrency` | `4`                               | How many operators act at once within a day.                                      |
| `--dir`         | `test-artifacts/simulator/<seed>` | Where the run keeps its settings, journal and manifest.                           |

The calibration is `loadCalibration()`'s: the committed defaults, with the
overlay named by `SIMULATOR_CALIBRATION` laid over them where that is set.

## What the clock does

The clock moves once per simulated day, to the last instant anything happens
that day, and only while no event is under way. Within the day operators act
side by side, up to the concurrency, and each operator's own events go in
calendar order. A Defra ID token lasts an hour of simulated time and the
executors renew one only as an event starts, so a jump under an event in
flight would leave its later calls unauthorised; holding the clock still while
events run is what lets them overlap. Every record of a day is therefore
stamped at that day's last planned instant, plus the real seconds the day took
to execute.

A fresh run takes the clock off first, so the day it plans to is the real one
and the stack starts the year from January. From there the stack only moves
forwards. A resumed run finds the clock where the stopped one left it plus the
real time since, so the day it resumes into may run later than planned, and a
run that starts before the day a stack has already reached wants the stack
brought up again first.

## Resuming

Every executed event is appended to `journal.jsonl` in the run directory, with
the ids the service gave: the organisation and its Defra ID user on an
approval, the note's path, number, tonnage, price and issue date on a PRN
event. Running again in the same directory replans from the saved
`settings.json`, rebuilds the operators the service already holds from the
journal, and carries on from the first event not yet done. Nothing already
made is made again; to start over, run in another `--dir` or delete the
directory, against a stack brought up fresh. Asking for a different
seed, scale, period or profile mix than the run was planned with is refused,
as is a calibration that plans differently, so resume under the same
`SIMULATOR_CALIBRATION` as the run started with; concurrency can change.

`SIGINT` or `SIGTERM` stops the run cleanly: nothing more is dispatched, the
events under way finish and are journalled, the manifest is written, and the
run exits 130. An upload can take a minute to finish, so give it that. A
second signal, or a `SIGKILL`, cuts the events under way off unjournalled, and
each is done again on resume: for an approval that is a second organisation
for the same planned operator, so prefer the one signal.

A run that stops on a failed event journals nothing for it, so resuming does
it again, and the run says when the event was executed but the journal write
failed. An approval makes the organisation before it links the user and seeds
the sites, so one that failed part way, or was journalled after being executed,
may have left an organisation the journal does not name; the service is the
place to look before resuming.

## The manifest

`manifest.json` is written when the run ends, however it ends. It names every
operator the run made, under the reference number and six-digit organisation
id the service gave it, each registration with its ids and numbers, and the
Defra ID user linked to the operator.

To sign in as one through the stub: open the frontend, which sends the browser
to the stub's sign-in page, and enter the manifest's email; the stub asks for
no password. The browser has to reach the stub by the name the frontend
redirects to, so `defra-id-stub` resolves to localhost, as for the browser
journeys. The stub keeps its users in Redis, so they outlive the run and the
containers, but not the volume.

`complete` says whether every planned event was done, with `events` giving
the count either way.

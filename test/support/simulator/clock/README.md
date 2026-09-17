# Simulated clock

The operator activity simulator replays a year of activity day by day, and the
API stamps server time, so the whole local stack has to believe it is the date
the simulator says. `fake-clock.cjs` is a `--require` preload that replaces the
global `Date` in a Node process. Every process sharing `clock.txt` derives its
offset from that file's mtime, so processes that started at different moments
agree on the instant.

It is off unless you ask for it. `compose.clock.yml` is what turns it on, and a
plain `docker compose up` never reads that file.

## Running the stack on a simulated clock

```bash
docker compose -f compose.yml -f compose.clock.yml up -d
npm run clock -- 2026-02-16
```

Time flows at the real rate from there. Run `npm run clock` again to jump to
another date; it takes effect everywhere within a quarter of a second, with no
restart. Only move forwards — nothing in the stack expects to see time go
backwards. A jump of more than an hour lands beyond the lifetime of any token
already issued, so whoever is signed in has to sign in again.

`npm run clock -- off` hands the stack back to real time, which is itself a jump
backwards of however far the run had got. It ends the run: bring the stack down
rather than carrying on against it.

A process of your own joins the clock through the same preload:

```bash
NODE_OPTIONS="--require $PWD/test/support/simulator/clock/fake-clock.cjs" \
FAKE_CLOCK_FILE="$PWD/test/support/simulator/clock/clock.txt" \
node your-script.js
```

`simulated-clock.js` exports `setSimulatedNow` and `clearSimulatedClock` for a
process that moves the clock itself.

Playwright and the browser it drives are not on the clock. A journey spec run
against a simulated stack still reaches services that believe the simulated
date, but any date the spec works out for itself is today's.

## What the override does besides mounting the preload

Mongo's TTL monitor runs on real time, so it would reap an unsubmitted summary
log whose simulated expiry is in the real past, within a minute of the upload.
The override starts mongod with `ttlMonitorEnabled=false`.

`npm run test:unit` checks the preload.

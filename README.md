epr-re-ex-journey-tests

The consolidated WDIO journey-test suite for the Re/Ex service line, exercising
`epr-frontend`, `epr-backend`, and `epr-re-ex-admin-frontend` together against
one shared backing-services stack (mongodb, redis, floci, cognito-stub,
defra-id-stub, epr-re-ex-entra-stub). This repo replaces three previously
separate journey-test repos, one per app.

- [Local](#local)
  - [Requirements](#requirements)
    - [Node.js](#nodejs)
    - [Gitleaks](#gitleaks)
    - [Mise](#mise)
  - [Setup](#setup)
  - [Running local tests](#running-local-tests)
  - [Feature flags in journey tests](#feature-flags-in-journey-tests)
  - [Generating test organisation data](#generating-test-organisation-data)
  - [Generating summary-log spreadsheets](#generating-summary-log-spreadsheets)
  - [Debugging local tests](#debugging-local-tests)
- [Production](#production)
  - [Running tests with Profile](#running-tests-with-profile)
- [Requirements of CDP Environment Tests](#requirements-of-cdp-environment-tests)
- [Running on GitHub](#running-on-github)
- [BrowserStack](#browserstack)
- [Licence](#licence)
  - [About the licence](#about-the-licence)

## Local Development

### Requirements

#### Node.js

Please install [Node.js](http://nodejs.org/) `>= v20` and [npm](https://nodejs.org/) `>= v9`. You will find it
easier to use the Node Version Manager [nvm](https://github.com/creationix/nvm)

To use the correct version of Node.js for this application, via nvm:

```bash
nvm use
```

#### Gitleaks

[Gitleaks](https://github.com/gitleaks/gitleaks) is required for pre-commit secret scanning and must be available on your PATH.

The simplest install on macOS/Linux is via [mise](#mise)

```bash
mise trust && mise install
```

Alternatively, install directly:

- macOS: `brew install gitleaks`
- Linux/Windows: see the [gitleaks releases page](https://github.com/gitleaks/gitleaks/releases)

#### Mise

[mise](https://mise.jdx.dev/) - a polyglot version manager that reads `mise.toml` in this repo to install the correct pinned versions

1. [Install](https://mise.jdx.dev/getting-started.html#installing-mise-cli)
2. [Activate](https://mise.jdx.dev/getting-started.html#activate-mise) in your shell

### Setup

Install application dependencies:

```bash
npm install
```

### Additional configuration in Linux

For Linux based machines, you will need to add this entry into your `etc/hosts` file for the tests to run locally:

```
127.0.0.1 defra-id-stub
```

### Running local tests

Bring up the three apps under test and their backing services with `docker compose up -d --build` (see [Running on GitHub](#running-on-github) below for what `compose.yml` provides), then:

```bash
npm run test:local
```

Running tests with a specific tag locally - for example, a frontend PRN spec or an admin spec:

```bash
GREP='@delprnexp' npm run test:local:grep
GREP='@tonnagemonitoring' npm run test:local:grep
```

**Tag conventions:**

- `@smoketest` - broad, high-value specs (real S3/CDP Uploader exercise, wide page traversal across an app variant) worth running everywhere: locally, in GHA, and as the CDP Portal's default profile against a real environment. Reserve it for breadth/infra-relevance, not for re-proving business logic already covered by an ordinary spec - that just slows down every run without adding signal.
- `@envonly` - specs that can only run against a real deployed environment (e.g. signing in through the real Microsoft/Entra login form, which only exists when the admin app is wired to the real Entra IdP - locally/GHA use `epr-re-ex-entra-stub` instead, which never renders that form). `test:local`/`test:github` exclude `@envonly`; the CDP Portal-only scripts (`test`, `test:smoketest`) don't, since that's exactly where these specs are meant to run.

If for whatever reason [the stable version of Chrome for Testing](https://googlechromelabs.github.io/chrome-for-testing/#stable)
is not working for you, then you can specify the Chrome version when running locally

```sh
WDIO_CHROME_VERSION=146.0.7680.154 npm run test:local:grep
```

### Feature flags in journey tests

**`compose.yml` is the single source of flag state.** Each `FEATURE_FLAG_*` env
var defaults in `compose.yml` (for example `${FEATURE_FLAG_X:-true}`), and the
suite runs and asserts that one configured state unconditionally. Nothing else
sets flags in CI: the `run-journey-tests` action takes no flag inputs, so every
caller (this repo's PR checks and the `epr-frontend`/`epr-backend`/
`epr-re-ex-admin-frontend` PR checks alike) exercises the same state and
cannot drift. Note the interpolation default only fires while the env var is
unset, so do not export `FEATURE_FLAG_*` vars in workflow env blocks.

Most flags stop there. An in-flight feature is typically tested flag-on in CI
(ahead of the production flip) while the flag-off gating is covered by the
service's own unit and integration tests. When the flag flips on in production
and is later retired, the journey suite needs no changes beyond eventually
dropping the env var from `compose.yml`.

**Named matrix passes are the escalation, not the default.**
`check-pull-request.yml` runs the suite once per named entry in
`matrix.include`. A permanent `baseline` entry runs the `compose.yml` defaults.
If a flag's two states both genuinely warrant journey coverage (a risky or
long-lived divergence, not just new messaging), give it a matrix entry that pins
the non-default state, plumb the value through to the relevant app container(s)
and the runner, and branch the affected specs on it. Cost is linear (`N + 1`
passes for `N` overridden flags). Reach for this deliberately: most flags do
not earn it.

The plumbing, when a flag earns it: add an action input for the flag, have the
action's first step write it once to `$GITHUB_ENV`
(`echo "FEATURE_FLAG_X=${{ inputs.feature-flag-x }}" >> "$GITHUB_ENV"`) so the
same value reaches both the relevant app container (via `compose.yml`
interpolation) and the wdio runner (via `process.env`), then pass
`${{ matrix.x || '<default>' }}` from the matrix step. Read the env var in one
shared `test/support/flags.js` and branch specs on `flags.x`, for example
letting the flag pick the assertion verb:
`const assert = flags.x ? checkBodyText : checkBodyTextDoesNotInclude`. Once
the flag is retired, delete the matrix entry and this plumbing - `baseline`
stays put.

**The required check is a gate job.** Branch protection requires the exact name
`Run Journey Tests`, which a matrix leg (`Run Journey Tests (<name>)`) can never
match. So an aggregate job named `Run Journey Tests` `needs` the legs and passes
only if all of them did (`if: always()`, so a failed leg fails the gate rather
than skipping it). Its fixed name keeps branch protection decoupled from the
matrix contents: adding or retiring an entry edits only `matrix.include`.

### Generating test organisation data

This only applies to local builds. `test/support/data-generator/` (ported
from `epr-backend-journey-tests`) contains scripts that generate mock
approved Organisation, Registration and Accreditation records directly via
the API - useful for populating a local environment with data to explore
manually, outside of the automated test suite.

You can generate 5 organisation details, registrations and accreditations
(all linked together, using a single random material) in one go with this
command:

```bash
npm run generatedata
```

If you want to generate an organisation that has all materials (but varied
waste processing types, like Reprocessor Input / Output / Exporter), you can
run:

```bash
npm run generatedata:allMaterials
```

If you want to generate organisations that have all materials and all waste
processing types (like Reprocessor Input / Output / Exporter in a single
Organisation), you can run:

```bash
npm run generatedata:allMaterialsMixed
```

To generate with user linking (this assumes you have Defra ID Stub and Entra
Stub running locally):

```bash
npm run generatedata:withLinking
npm run generatedata:allMaterials:withLinking
npm run generatedata:allMaterialsMixed:withLinking
```

This will create mock approved Organisation datasets with linked users. Only
to be used for local development purposes.

### Generating summary-log spreadsheets

`test/support/spreadsheet/` (ported from `epr-backend-journey-tests`) is a
built-in generator that can be used to generate a spreadsheet for Summary
Logs, on demand, instead of relying only on static fixtures under
`test/fixtures/`. It fills a real committed template from
`resources/templates/` with N rows of randomised-but-valid data, giving exact,
controlled row counts/content for a new test rather than searching for (or
hand-editing) a fixture that happens to already have the right shape. It's a
standalone module today - no spec currently calls it - available for
authoring new summary-log tests that need this.

Five generators are available, one per waste-processing type:

```bash
npm run generate:spreadsheet:output              # Reprocessor Output
npm run generate:spreadsheet:input                # Reprocessor Input
npm run generate:spreadsheet:exporter              # Exporter
npm run generate:spreadsheet:regOnlyExporter       # Registered Only (Unaccredited) Exporter
npm run generate:spreadsheet:regOnlyReprocessor    # Registered Only (Unaccredited) Reprocessor
```

You can also pass in registration number, accreditation number, material and
number of rows to generate via environment variables. For example, to
generate 20 rows of Reprocessor Output for Steel with a specific registration
and accreditation number:

```bash
ROWS=20 MATERIAL=ST REG_NUMBER=reg-number-123 ACC_NUMBER=acc-number-123 npm run generate:spreadsheet:output
```

`MATERIAL` is one of the suffixes in `shared-spreadsheet-values.js`'s
`MATERIALS`: Aluminium is `AL`, Fibre-based composite is `FB`, Glass is `GR`
(Re-melt) or `GO` (Other), Paper or board is `PA`, Plastic is `PL`, Steel is
`ST`, Wood is `WO`. Random if omitted.

To dynamically populate the spreadsheet, use the `SHEETS` environment
variable (0-indexed, Cover sheet doesn't count) to specify which sheets to
populate according to their index. For example, with Reprocessor Output, to
populate only the first sheet (Received) and leave the others empty:

```bash
SHEETS=0 ROWS=5 npm run generate:spreadsheet:output
```

To populate the first and third sheets (Reprocessor Input example) only:

```bash
SHEETS=0,2 npm run generate:spreadsheet:input
```

You do not need to pass in an accreditation number for Registered Only
spreadsheets, since it wouldn't be used.

To append more rows onto an existing generated spreadsheet, use the
`FILENAME` environment variable to specify the file and `ROW_OFFSET` to
specify how many rows to offset the new rows from. For example, for a
previous spreadsheet that already has 10 rows generated, append 10 more:

```bash
FILENAME=./data/filename.xlsx ROW_OFFSET=10 ROWS=10 MATERIAL=AL REG_NUMBER=R25SR500000912AL ACC_NUMBER=ACC123456 npm run generate:spreadsheet:input
```

Generated files are written to `data/` (gitignored - transient output only;
`resources/templates/` holds the committed source templates, not `data/`).

### Debugging local tests

```bash
npm run test:local:debug
```

## Production

### Running the tests

Tests are run from the CDP-Portal under the Test Suites section. Before any changes can be run, a new docker image must be built, this will happen automatically when a pull request is merged into the `main` branch.
You can check the progress of the build under the actions section of this repository. Builds typically take around 1-2 minutes.

The results of the test run are made available in the portal.

### Running tests with Profile

By default in the CDP-Portal only tests tagged with @smoketest are run. If you wish to run all the tests, pass in `all` in the profile section of the CDP Portal UI.

Two other profiles skip the test run entirely and instead seed data via the
[data generator](#generating-test-organisation-data), exiting immediately
afterwards:

- `generate` - runs `npm run generatedata:allMaterialsMixed:withLinking`
- `generateInd` - runs `npm run generatedata:withLinking`

## Requirements of CDP Environment Tests

1. Your service builds as a docker container using the `.github/workflows/publish.yml`
   The workflow tags the docker images allowing the CDP Portal to identify how the container should be run on the platform.
   It also ensures its published to the correct docker repository.

2. The Dockerfile's entrypoint script should return exit code of 0 if the test suite passes or 1/>0 if it fails

3. Test reports should be published to S3 using the script in `./bin/publish-tests.sh`

## Running on GitHub

Alternatively you can run the test suite as a GitHub workflow.
Test runs on GitHub are not able to connect to the CDP Test environments. Instead, they run the tests against the three apps under test (`epr-frontend`, `epr-backend`, `epr-re-ex-admin-frontend`) running in docker, alongside their backing services (mongodb, redis, floci as an AWS emulator, cognito-stub, defra-id-stub, epr-re-ex-entra-stub) and a `selenium-chrome` container for headless runs. `docker/scripts/` pre-populates mongo and creates the floci (S3/SQS/SNS) resources each app needs on startup.

Each app service's `build:` block builds from a sibling checkout (`../epr-backend`, etc.) by default when one exists; override `EPR_BACKEND`/`EPR_FRONTEND`/`EPR_RE_EX_ADMIN_FRONTEND` to pin a specific published image tag instead. `run-journey-tests/action.yml` uses this same mechanism to test a matching in-flight branch from any of the three app repos against this suite - see [Feature flags in journey tests](#feature-flags-in-journey-tests) above for how flag state stays consistent across that boundary.

Steps:

1. Test the setup locally with `docker compose up -d --build` and `npm run test:github`.
2. `.github/workflows/journey-tests.yml` is already wired up to run on manual dispatch or when called from another workflow.

By default, the provided workflow will run when triggered manually from GitHub or when triggered by another workflow.

If you want to use the repository exclusively for running docker composed based test suites consider disabling the publish.yml workflow.

## BrowserStack

Two wdio configuration files are provided to help run the tests using BrowserStack in both a GitHub workflow (`wdio.github.browserstack.conf.js`) and from the CDP Portal (`wdio.browserstack.conf.js`).
They can be run from npm using the `npm run test:browserstack` (for running via portal) and `npm run test:github:browserstack` (from GitHib runner).
See the CDP Documentation for more details.

## Licence

THIS INFORMATION IS LICENSED UNDER THE CONDITIONS OF THE OPEN GOVERNMENT LICENCE found at:

<http://www.nationalarchives.gov.uk/doc/open-government-licence/version/3>

The following attribution statement MUST be cited in your products and applications when using this information.

> Contains public sector information licensed under the Open Government licence v3

### About the licence

The Open Government Licence (OGL) was developed by the Controller of Her Majesty's Stationery Office (HMSO) to enable
information providers in the public sector to license the use and re-use of their information under a common open
licence.

It is designed to encourage use and re-use of information freely and flexibly, with only a few conditions.

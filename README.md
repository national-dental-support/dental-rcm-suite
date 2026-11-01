# Dental RCM Suite

Five revenue-cycle management applications for dental practices and dental
service organisations, sharing one data model, one API and one sign-in.

Licensed under Apache-2.0.

## The applications

| Application      | What it does |
|------------------|--------------|
| **Denial-IQ**    | Denial management. A worklist of denied and rejected claims, assignment and ownership, appeal tracking, and remediation steps per denial reason. |
| **Recon-IQ**     | Payment reconciliation. Matches remittances to payments, surfaces EOBs with no matching payment and payments with no matching EOB, and tracks what is fully reconciled. |
| **Payer-IQ**     | Payer and contract analysis. Fee schedules, contracted versus paid amounts, underpayment detection and network lease arrangements. |
| **InsightFlow**  | Reporting and analytics. Executive summary, KPIs with thresholds, denial and payer-mix analysis, AR ageing, cycle time and forecasting. |
| **Claim Vision** | Pre-submission review. Rules that catch the coding, eligibility and attachment problems that cause a claim to be rejected, before it is sent. |

Each application is independently entitled, so a deployment can run one of them
or all five.

## Architecture

- **Web** - Angular, served as static files behind nginx
- **API** - Node.js and Express, TypeScript
- **Database** - Microsoft SQL Server

Tenancy is enforced in the database, not only in the application. Every tenant
table carries a `customer_id` and is covered by a row-level security policy, so
a query issued without tenant context returns nothing rather than everything.
The API connects as a restricted login that holds no schema rights.

## Requirements

- Docker and Docker Compose, or
- Node.js 22 or later and a reachable SQL Server instance

## Quick start

```bash
cp .env.example .env
```

Set at least these in `.env`:

| Variable | Purpose |
|----------|---------|
| `DB_SA_PASSWORD` | SQL Server administrator password, used to create the database |
| `APP_DB_PASSWORD` | Password for the restricted application login |
| `JWT_SECRET` | Signs session tokens. The API refuses to start without it. |
| `FIELD_ENCRYPTION_KEY` | Encrypts protected fields at rest. Back this up somewhere other than the host: lose it and you lose the data it protects. |

Then:

```bash
docker compose up --build
```

This creates the database, applies the schema, and starts all three services.
The web application is on <http://127.0.0.1:4200>, the API on port 8080 and SQL
Server on 1433. Set `WEB_PORT`, `API_PORT_HOST` or `DB_PORT_HOST` if those are
already taken.

Use `127.0.0.1` rather than `localhost`. On Windows `localhost` resolves to the
IPv6 loopback first, which fails against an IPv4-only listener.

## First sign in

A fresh install seeds one administrator and nothing else:

- **Email** - `admin@localhost`, or whatever `BOOTSTRAP_ADMIN_EMAIL` is set to
- **Password** - `changeme-on-first-login`, or the value of
  `BOOTSTRAP_ADMIN_PASSWORD`

The password must be changed before any other route is reachable; every request
is refused with `AUTH_PASSWORD_CHANGE_REQUIRED` until it is. Set
`BOOTSTRAP_ADMIN_PASSWORD` before the first start if you would rather the
published default never existed on your installation.

## Authentication

Local by default. The suite authenticates against its own user table and issues
a signed session token. A token establishes who is calling; role, tenant and
account state are read from the database on each request, so a token cannot
grant itself a role or a tenant.

OIDC is optional and configured entirely from the environment
(`OIDC_ISSUER`, `OIDC_AUDIENCE`, `OIDC_JWKS_URL`). No identity provider is
compiled in. With OIDC unset the local path is used.

The local path has no multi-factor authentication. MFA is delegated to the
identity provider in OIDC mode.

## There is no sample data

A fresh install is an empty schema. No claims, patients, payers or volume are
included, so the applications render empty states until you load your own data.

Claims and remittances are ingested as X12: 837 for claims and 835 for
remittance advice. Contracts, fee schedules and procedure codes are loaded
separately.

No licensed code set is included. CDT is copyrighted by the American Dental
Association and CPT by the American Medical Association; the schema that holds
them is here, the codes themselves are not, and you need your own licence.
CARC and RARC claim-adjustment codes are open X12 standards and are included.

## Tests

```bash
cd apps/api && npm test     # API
cd apps/web && npm test     # Web
```

The default suites need no database. The tenant-isolation suite can also be run
against a live database as the restricted application login, which is the only
way to prove the row-level security policy is doing anything - run as a database
owner it passes whether or not the policy exists, because the policy exempts
owners.

## Contributing

Issues and pull requests are welcome. Fork the repository, work on a branch and
open a pull request against the default branch. Pull requests are reviewed and
merged by the maintainer.

## Security

Please do not open a public issue for a security problem. Use GitHub's private
vulnerability reporting on this repository instead.

## Licence

Apache License 2.0 - see `LICENSE`.

Apache-2.0 grants rights to the code. It does not grant any right to the names
or logos of the applications above; see `NOTICE`. A fork intended for
redistribution should carry its own name.

# Verification Report

**Project:** Attendly — Student Attendance Management System  
**Date:** 2026-10-29 (local, UTC+05:30)  
**Result:** PASS

This report records the final verification of the application, API, browser flows, Docker image, Docker Compose stack, Jenkins pipeline, and Kubernetes deployment.

## Environment

| Component | Version |
| --- | --- |
| Host OS | Windows 11 Home Single Language 10.0.22631 |
| Node.js | v24.22.1 |
| npm | 11.19.1 |
| Git | 2.56.0.windows.4 |
| Docker Engine | 29.7.2 |
| Docker Compose | 5.4.0 |
| kubectl | v1.36.1 |
| kind | v0.33.0 |
| Kubernetes node image | kindest/node:v1.37.0 |
| Chrome | 156.0.8078.48 |
| Selenium WebDriver | 4.51.0 |
| Jenkins | `jenkins/jenkins:lts-jdk17` custom image |
| Jenkins toolchain | Node v22.23.4, npm 10.9.9, Git 2.47.3, Docker CLI 27.5.1, Java 17.0.18 |

## Automated application checks

All commands were run from the project root.

| Command | Result | Details |
| --- | --- | --- |
| `npm run check` | PASS | Syntax checks for server, API, database, reports, validation, frontend, scripts, and tests |
| `npm test` | PASS | 22 tests, 22 passed, 0 failed |
| `npm run verify` | PASS | 12 smoke checks passed |
| `npm run test:e2e` | PASS | 7 Selenium tests, 7 passed, 0 failed |
| `npm audit --omit=dev` | PASS | 0 vulnerabilities across 119 production dependencies |
| Adversarial API pass | PASS | 62/62 checks (validation, IDs, body limits, CSV, security headers) |
| Clean-room install | PASS | Fresh `npm ci`, checks, API tests, and smoke verification |
| SQLite integrity | PASS | `integrity_check` = ok, 0 foreign-key violations |

The 22 API tests cover health, static serving, JSON 404s, student validation/editing, strict ID parsing, malformed/oversized JSON handling, attendance defaults and validation, incomplete/duplicate attendance rejection, saving all periods, monthly calculations, low-attendance flags, individual reports, daily history, corrections, threshold settings, CSV BOM/headers and formula neutralization, dashboard aggregation, working-period removal, cascade deletion, and database restart persistence.

The 7 Selenium tests cover the dashboard, adding a student through the UI, marking/saving/reloading attendance, monthly and individual reports, CSV export, the no-data state for students without attendance, and changing the attendance threshold.

## Revalidation pass

A second end-to-end pass was run on 2026-10-29 after the initial delivery. It exercised the API adversarially, rebuilt the image without cache, and redeployed both Compose and Kubernetes.

Issues found and fixed:

- Threshold settings accepted `null`, booleans, and empty strings as `0` or `1`; these now return `400`.
- Student IDs accepted exponential notation such as `1e3`; IDs now require plain positive integers.
- Oversized JSON bodies returned `500`; they now return `413` with a JSON error.
- Students with no recorded periods displayed `0%` and “On track”; reports now show a neutral “No data” state.
- Static assets were cached for one hour despite unhashed filenames; assets now revalidate with ETags.

Evidence:

- Adversarial API pass: **62/62** checks.
- Clean-room copy: fresh `npm ci`, `npm run check`, **22/22** API tests, and **12/12** smoke checks.
- `docker build --no-cache --pull`: PASS; isolated container healthy as UID 1000 (`node`).
- Isolated container seed with `TZ=Asia/Kolkata`: 12 students, 21 working days, 147 periods, 1,580 present, 184 absent, 89.57% average, 2 low-attendance students.
- SQLite `integrity_check` = `ok`; foreign-key violations = 0 after restart.
- Compose and Kubernetes redeployed to the build #8 image; data totals unchanged.
- The no-data Selenium test now waits for rendered row text instead of raw element presence; it passed three consecutive full-suite runs (7/7 each).

## Docker

| Check | Result |
| --- | --- |
| `docker build -t student-attendance:latest .` | PASS |
| No-cache rebuild (`--no-cache --pull`) | PASS |
| Multi-stage production image, non-root `node` user | PASS |
| Image `HEALTHCHECK` against `/api/health` | PASS |
| Container health, student creation, 7-period save, monthly/individual reports | PASS |
| CSV export BOM (`EF BB BF`) and content | PASS |
| Data persisted across container restart | PASS |
| Seed script available inside the runtime image | PASS |

## Docker Compose

`docker compose config --quiet` returned successfully. The final stack contained:

| Service | Status | Port |
| --- | --- | --- |
| `student-attendance-app` | Up, healthy | http://localhost:3000 |
| `student-attendance-jenkins` | Up, healthy | http://localhost:8080 |

Verification performed:

- Started the app from `student-attendance:latest` with the named volume `student-attendance-data`.
- Seeded the demo class: **12 students, 21 working days, 147 working periods**.
- Monthly report: **1,580 present, 184 absent, 89.57% average, 2 low-attendance students**.
- Restarted the container (`docker compose restart app`), then recreated it (`--force-recreate`); the report totals were unchanged.
- Exported CSV through the running container; response started with the UTF-8 BOM `EF BB BF`.
- Fetched the SPA shell successfully from `http://localhost:3000`.

## Jenkins CI/CD

Job: `student-attendance-pipeline`  
URL: http://localhost:8080/job/student-attendance-pipeline/  
Credentials: `admin` / `admin123` (local demo only)

| Build | Commit | Trigger | Result | Duration |
| --- | --- | --- | --- | --- |
| #1 | — | SCM change | FAILURE | 47 ms |
| #2 | `84e6f1c` | User | SUCCESS | 45.9 s |
| #3 | `4bac3aa` | SCM change | SUCCESS | 27.7 s |
| #4 | `4bac3aa` | User | SUCCESS | 35.3 s |
| #5 | `f97ebc0` | SCM change | SUCCESS | 10.3 s |
| #6 | `055fc65` | User | SUCCESS | 15.0 s |
| #7 | `df2cff6` | User | SUCCESS | 12.2 s |
| #8 | `122609d` | User | SUCCESS | 14.2 s |

Build #1 failed because Jenkins refused to check out the local `file:///workspace` remote by default. The controller was configured with:

```text
-Dhudson.plugins.git.GitSCM.ALLOW_LOCAL_CHECKOUT=true
```

The property is present in both `jenkins/Dockerfile` and the Compose `JAVA_OPTS`. Subsequent builds succeeded.

Documentation-only commits after the final code build may trigger additional successful builds; they do not change the application image. The final code build (#8) executed every stage:

1. **Environment** — reported Node v22.23.4, npm 10.9.9, Git 2.47.3, Docker CLI 27.5.1, Docker server 29.7.2.
2. **Install dependencies** — `npm ci` installed 132 packages with 0 vulnerabilities.
3. **Validate application** — `npm run check` and all 22 API tests passed.
4. **Build Docker image** — built `student-attendance:ci-8` and retagged `student-attendance:latest`.
5. **Container smoke test** — started the image, waited for health, created a student, saved seven periods, verified the monthly report, and removed the container.

Build #8 checked out commit `122609d` and finished with `Finished: SUCCESS` in 14.2 seconds. Its image ID is `sha256:ec22786cc3c10884f937b58f202c3af204d88957eb563c6f8fa56a8b1460fa1d`.

## Kubernetes with kind

| Check | Result |
| --- | --- |
| `kind create cluster --name student-attendance --config k8s/kind-config.yaml` | PASS (Ready in 14 s) |
| `kind load docker-image student-attendance:latest` | PASS |
| `kubectl apply -k k8s` | PASS |
| Deployment rollout | PASS |
| Pod readiness | `1/1 Running` |
| Service | NodePort **30080** → port 80 → container 3000 |
| PVC | `attendance-data` Bound, 1 GiB, `standard` StorageClass |
| Health at `http://localhost:30080/api/health` | PASS |
| Persistence across pod deletion/replacement | PASS |

The build #8 image was loaded into kind, the Deployment was restarted, and the pod was deleted and replaced again. The replacement pod served the same report totals from the PVC, and the new validation behavior (`null` threshold → `400`) was confirmed through NodePort 30080. The demo data was seeded inside the pod with `TZ=Asia/Kolkata`:

- 12 students
- 21 working days
- 147 working periods
- 1,580 present
- 184 absent
- 89.57% average attendance
- 2 low-attendance students

The deployment uses `imagePullPolicy: IfNotPresent`, `runAsNonRoot`, dropped Linux capabilities, and readiness/liveness probes. The container filesystem is writable because SQLite writes to `/app/data`; the PVC is the persistent path.

## UI verification

The UI was exercised manually and with Selenium. The following screenshots were captured from a seeded instance:

| Screenshot | File |
| --- | --- |
| Dashboard | `screenshots/01-dashboard.png` |
| Daily attendance | `screenshots/02-attendance.png` |
| Students | `screenshots/03-students.png` |
| Monthly reports | `screenshots/04-reports.png` |
| Individual student report | `screenshots/05-student-report.png` |
| Settings | `screenshots/06-settings.png` |

Manual checks included adding/editing/deleting students, bulk marking, saving and reloading a register, correcting a status, toggling working periods, changing the threshold, exporting CSV, and verifying responsive layout.

## Notes and known limitations

- **Jenkins plugin advisories:** the image build reports security advisories for `workflow-multibranch` and `pipeline-groovy-lib`. These are acceptable for the local demo; update or pin newer plugin versions before exposing Jenkins.
- **Jenkins privileges:** Compose runs Jenkins as `root` so it can use the mounted Docker socket. This is a local-development choice, not a production configuration.
- **Application authentication:** the app intentionally has no login. Deploy it behind an authenticated reverse proxy before exposing it.
- **Timezone:** containers default to UTC. The demo data in Compose and Kubernetes was seeded with `TZ=Asia/Kolkata` so it matches the local demo date. Use your own IANA timezone if needed.
- **GitHub:** no remote was configured and no push was performed because GitHub credentials were unavailable in this environment. The local repository is initialized on `main` with the complete project history.
- **Docker Hub:** no registry credentials were available, so the image was not pushed. It is available locally as `student-attendance:latest` and `student-attendance:ci-8`.

## Reproduction commands

```bash
npm ci
npm run check
npm test
npm run verify
npm run test:e2e

docker build -t student-attendance:latest .
docker compose up -d --build
docker compose exec -e TZ=Asia/Kolkata app npm run seed -- --reset

kind create cluster --name student-attendance --config k8s/kind-config.yaml
kind load docker-image student-attendance:latest --name student-attendance
kubectl apply -k k8s
kubectl -n student-attendance rollout status deployment/student-attendance --timeout=120s
```

Open:

- Application: http://localhost:3000
- Jenkins: http://localhost:8080
- Kubernetes NodePort: http://localhost:30080

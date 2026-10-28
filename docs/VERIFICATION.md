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
| `npm test` | PASS | 19 tests, 19 passed, 0 failed |
| `npm run verify` | PASS | 12 smoke checks passed |
| `npm run test:e2e` | PASS | 6 Selenium tests, 6 passed, 0 failed |
| `npm audit --omit=dev` | PASS | 0 vulnerabilities across 119 production dependencies |

The 19 API tests cover health, static serving, JSON 404s, student validation/editing, attendance defaults and validation, incomplete/duplicate attendance rejection, saving all periods, monthly calculations, low-attendance flags, individual reports, daily history, corrections, threshold settings, CSV BOM/headers, dashboard aggregation, working-period removal, cascade deletion, and database restart persistence.

The 6 Selenium tests cover the dashboard, adding a student through the UI, marking/saving/reloading attendance, monthly and individual reports, CSV export, and changing the attendance threshold.

## Docker

| Check | Result |
| --- | --- |
| `docker build -t student-attendance:latest .` | PASS |
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

Build #1 failed because Jenkins refused to check out the local `file:///workspace` remote by default. The controller was configured with:

```text
-Dhudson.plugins.git.GitSCM.ALLOW_LOCAL_CHECKOUT=true
```

The property is present in both `jenkins/Dockerfile` and the Compose `JAVA_OPTS`. Subsequent builds succeeded.

Documentation-only commits after the final code build may trigger additional successful builds; they do not change the application image. The final code build (#4) executed every stage:

1. **Environment** — reported Node v22.23.4, npm 10.9.9, Git 2.47.3, Docker CLI 27.5.1, Docker server 29.7.2.
2. **Install dependencies** — `npm ci` installed 132 packages with 0 vulnerabilities.
3. **Validate application** — `npm run check` and all 19 API tests passed.
4. **Build Docker image** — built `student-attendance:ci-4` and retagged `student-attendance:latest`.
5. **Container smoke test** — started the image, waited for health, created a student, saved seven periods, verified the monthly report, and removed the container.

Final log line: `Finished: SUCCESS`.

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

The pod was deleted and replaced by the Deployment. The replacement pod served the same report totals from the PVC. The demo data was then re-seeded inside the pod with `TZ=Asia/Kolkata`:

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

# Attendly — Faculty Showcase

**Student Attendance Management System using DevOps Tools**

A single-class attendance manager built with Node.js, Express, and SQLite, delivered through Git/GitHub, Jenkins, Docker, Kubernetes, and Selenium.

## Open these links

| What to show | Link | What it proves |
| --- | --- | --- |
| Application — Docker Compose | http://localhost:3000 | The working app and seeded demo data |
| Application — Kubernetes | http://localhost:30080 | The same image served through a NodePort |
| Jenkins dashboard | http://localhost:8080 | Jenkins is running with **no login** |
| Jenkins job | http://localhost:8080/job/student-attendance-pipeline/ | The GitHub-backed pipeline |
| Jenkins build #14 | http://localhost:8080/job/student-attendance-pipeline/14/ | **SUCCESS**, 19.7 s, commit `dbabc94` |
| Build #14 console | http://localhost:8080/job/student-attendance-pipeline/14/console | Clone from `github.com/Ksiri03/student-attende` |
| GitHub repository | https://github.com/Ksiri03/student-attende | Public source, README, report, and history |
| Project report (PDF) | https://raw.githubusercontent.com/Ksiri03/student-attende/main/docs/report/Attendly-Project-Report.pdf | 7-page faculty report |
| Report source | https://github.com/Ksiri03/student-attende/blob/main/docs/report/report.html | Editable HTML source |
| Verification report | https://github.com/Ksiri03/student-attende/blob/main/docs/VERIFICATION.md | Full test, build, Docker, and Kubernetes evidence |
| Report guide | https://github.com/Ksiri03/student-attende/blob/main/docs/report/REPORT_GUIDE.md | Screenshot map and re-render steps |
| README | https://github.com/Ksiri03/student-attende#readme | Setup, API, testing, and operations |

**Jenkins login:** none. Authentication is disabled for this local demo, and port 8080 is bound to `127.0.0.1`.

## Evidence at a glance

| Check | Result |
| --- | --- |
| Jenkins build #14 | **SUCCESS**, 19.7 s, commit `dbabc94` cloned from GitHub |
| Application image | `student-attendance:latest`, ID `4d6a62b8003f`, 352 MB |
| Docker images | Exactly three: app `latest`, Jenkins controller, kind node |
| Docker Compose | `student-attendance-app` healthy at http://localhost:3000 |
| Kubernetes | Pod `1/1 Running`; PVC `attendance-data` Bound (1 Gi); NodePort **30080** |
| API tests | 22 / 22 pass |
| Selenium tests | 7 / 7 pass |
| Smoke checks | 12 / 12 pass |
| Adversarial API checks | 62 / 62 pass |
| Demo data | 12 students, 147 working periods, 1,580 present, 184 absent, 89.57%, 2 low-attendance |

## 30-second introduction

> This is Attendly, a seven-period attendance manager for a single class. Faculty can mark attendance, correct past registers, view monthly percentages, flag students below 75%, and export CSV reports. The application is containerized with Docker, validated by a Jenkins pipeline that clones the public GitHub repository, and deployed both with Docker Compose and Kubernetes. Selenium verifies the main browser workflows.

## 5-minute demo flow

1. **GitHub (1 min).** Open the repository. Show the README, the `Jenkinsfile`, `Dockerfile`, `k8s/` manifests, and `docs/report/Attendly-Project-Report.pdf`. Point out commit `dbabc94`, the revision built by Jenkins.
2. **Jenkins (1 min).** Open http://localhost:8080 — no login. Open **student-attendance-pipeline** → **#14**. Show the all-green stage view and the console line `Cloning repository https://github.com/Ksiri03/student-attende.git`.
3. **Docker (30 s).** In a terminal:

   ```powershell
   docker images
   docker ps --format "table {{.Names}}\t{{.Image}}\t{{.Status}}"
   ```

   Show exactly three images and the healthy app/Jenkins containers.
4. **Application (1.5 min).** Open http://localhost:3000. Show the dashboard totals, mark or reload a register on **Attendance**, open **Reports**, and export CSV.
5. **Kubernetes (1 min).** Open http://localhost:30080. In a terminal:

   ```powershell
   kubectl -n student-attendance get pods,pvc,svc
   ```

   Show the Running pod, Bound PVC, and NodePort `80:30080/TCP`.
6. **Report (30 s).** Open the PDF link and show the 7-page report, especially pages 4–6 (GitHub, Jenkins, Docker, Kubernetes, Selenium).

## Useful commands

```powershell
# Health checks
curl.exe -s -o NUL -w "compose=%{http_code}`n" http://localhost:3000/api/health
curl.exe -s -o NUL -w "k8s=%{http_code}`n" http://localhost:30080/api/health

# Jenkins build #14 summary
curl.exe -s "http://localhost:8080/job/student-attendance-pipeline/14/api/json?tree=number,result,duration"

# Kubernetes state
kubectl -n student-attendance get pods,pvc,svc
```

## If something is not running

- **App at 3000 is down:** `docker compose up -d app`
- **Jenkins at 8080 is down:** `docker compose up -d jenkins`, then wait for the health check.
- **Kubernetes at 30080 is down:** check `kubectl -n student-attendance get pods`; restart the kind cluster if the node stopped.
- **Jenkins job is missing:** restart the Jenkins container; `jenkins/init.groovy.d/` recreates the job from GitHub.
- **You trigger a new build:** Jenkins creates #15 and retags `student-attendance:latest`. The report remains the build #14 evidence; update the report if you want the new build number and image ID.

## Honest limitations

- **Local demo only.** Jenkins has no authentication and is bound to `127.0.0.1`; never expose port 8080 to a network.
- **No Docker Hub image.** The application image is local; no registry credentials were used.
- **No app login.** Attendly is a single faculty workspace, not a multi-user product.
- **SQLite and one replica.** The Kubernetes deployment uses one replica and a `ReadWriteOnce` PVC.
- **SCM polling is paused** after build #14 so the report’s screenshots and image ID stay stable. Use **Build Now** for a live build.

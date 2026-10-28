pipeline {
  agent any

  options {
    timestamps()
    timeout(time: 25, unit: 'MINUTES')
    disableConcurrentBuilds()
    buildDiscarder(logRotator(numToKeepStr: '10', artifactNumToKeepStr: '5'))
  }

  environment {
    IMAGE_NAME = 'student-attendance'
    IMAGE_TAG = "ci-${BUILD_NUMBER}"
    CI_CONTAINER = "student-attendance-ci-${BUILD_NUMBER}"
  }

  stages {
    stage('Environment') {
      steps {
        sh '''
          set -eu
          echo "Node: $(node --version)"
          echo "npm:  $(npm --version)"
          echo "Git:  $(git --version)"
          echo "Docker CLI: $(docker --version)"
          docker info --format 'Docker server: {{.ServerVersion}} / {{.OSType}}'
        '''
      }
    }

    stage('Install dependencies') {
      steps {
        sh 'npm ci'
      }
    }

    stage('Validate application') {
      steps {
        sh 'npm run check'
        sh 'npm test'
      }
    }

    stage('Build Docker image') {
      steps {
        sh '''
          set -eu
          docker build -t "$IMAGE_NAME:$IMAGE_TAG" -t "$IMAGE_NAME:latest" .
          docker image inspect "$IMAGE_NAME:$IMAGE_TAG" --format 'Built image: {{.RepoTags}} ({{.Size}} bytes)'
        '''
      }
    }

    stage('Container smoke test') {
      steps {
        sh '''
          set -eu
          cleanup() {
            docker rm -f "$CI_CONTAINER" >/dev/null 2>&1 || true
          }
          trap cleanup EXIT
          cleanup

          docker run -d --name "$CI_CONTAINER" "$IMAGE_NAME:$IMAGE_TAG"

          ready=0
          for attempt in $(seq 1 40); do
            if docker exec "$CI_CONTAINER" node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>{if(!r.ok)process.exit(1);return r.json()}).then(j=>{if(j.status!=='OK')process.exit(1)}).catch(()=>process.exit(1))"; then
              ready=1
              break
            fi
            sleep 1
          done

          if [ "$ready" -ne 1 ]; then
            echo "Application container did not become healthy."
            docker logs "$CI_CONTAINER" || true
            exit 1
          fi

          docker exec -i "$CI_CONTAINER" node <<'NODE'
            const base = 'http://127.0.0.1:3000';

            async function request(pathname, options = {}) {
              const response = await fetch(base + pathname, {
                ...options,
                headers: {
                  ...(options.body ? { 'Content-Type': 'application/json' } : {}),
                  ...(options.headers || {})
                },
                body: options.body ? JSON.stringify(options.body) : undefined
              });
              const text = await response.text();
              let body = null;
              try { body = JSON.parse(text); } catch { body = text; }
              if (!response.ok) {
                throw new Error(`${pathname} failed: ${response.status} ${text}`);
              }
              return body;
            }

            (async () => {
              const health = await request('/api/health');
              if (health.status !== 'OK') throw new Error('Health check failed.');

              const created = await request('/api/students', {
                method: 'POST',
                body: {
                  roll_number: 'CI001',
                  name: 'CI Smoke Student',
                  department: 'Computer Science'
                }
              });

              const attendance = Array.from({ length: 7 }, (_, index) => ({
                student_id: created.student.id,
                period: index + 1,
                status: 'Present'
              }));

              await request('/api/attendance', {
                method: 'POST',
                body: {
                  date: '2026-06-01',
                  working_periods: [1, 2, 3, 4, 5, 6, 7],
                  attendance
                }
              });

              const report = await request('/api/reports/monthly?month=2026-06');
              if (report.students.length !== 1) throw new Error('Report student count mismatch.');
              if (report.students[0].attendance_percentage !== 100) {
                throw new Error('Report percentage mismatch.');
              }

              console.log('Container API smoke test passed.');
            })().catch((error) => {
              console.error(error);
              process.exit(1);
            });
NODE
        '''
      }
    }
  }

  post {
    success {
      echo 'Build, tests, Docker image and container smoke test passed.'
    }
    failure {
      echo 'Pipeline failed. Check the stage logs above.'
    }
    always {
      sh 'docker rm -f "$CI_CONTAINER" >/dev/null 2>&1 || true'
    }
  }
}

import hudson.plugins.git.BranchSpec
import hudson.plugins.git.GitSCM
import hudson.plugins.git.UserRemoteConfig
import hudson.triggers.SCMTrigger
import jenkins.model.Jenkins
import org.jenkinsci.plugins.workflow.cps.CpsScmFlowDefinition
import org.jenkinsci.plugins.workflow.job.WorkflowJob

def instance = Jenkins.get()
def jobName = "student-attendance-pipeline"
def job = instance.getItem(jobName)

if (job == null) {
  job = instance.createProject(WorkflowJob, jobName)
  println "Created Jenkins job '${jobName}'."
} else {
  println "Updating Jenkins job '${jobName}'."
}

def scm = new GitSCM(
  [new UserRemoteConfig("https://github.com/Ksiri03/student-attende.git", "origin", null, null)],
  [new BranchSpec("*/main")],
  false,
  [],
  null,
  null,
  []
)

job.setDescription(
  "Builds and validates the Student Attendance Management System, " +
  "then builds a Docker image and runs a container smoke test."
)
job.setDefinition(new CpsScmFlowDefinition(scm, "Jenkinsfile"))

if (job.getTriggers().isEmpty()) {
  job.addTrigger(new SCMTrigger("H/5 * * * *"))
}

job.save()
println "Jenkins pipeline is ready: ${jobName}"

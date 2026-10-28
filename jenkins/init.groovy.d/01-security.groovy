import hudson.model.User
import hudson.security.FullControlOnceLoggedInAuthorizationStrategy
import hudson.security.HudsonPrivateSecurityRealm
import jenkins.model.Jenkins
import jenkins.model.JenkinsLocationConfiguration

def instance = Jenkins.get()
def username = System.getenv("JENKINS_ADMIN_ID") ?: "admin"
def password = System.getenv("JENKINS_ADMIN_PASSWORD") ?: "admin123"

if (!(instance.getSecurityRealm() instanceof HudsonPrivateSecurityRealm)) {
  def realm = new HudsonPrivateSecurityRealm(false)
  if (User.get(username, false) == null) {
    realm.createAccount(username, password)
  }
  instance.setSecurityRealm(realm)

  def strategy = new FullControlOnceLoggedInAuthorizationStrategy()
  strategy.setAllowAnonymousRead(false)
  instance.setAuthorizationStrategy(strategy)
}

def location = JenkinsLocationConfiguration.get()
if (!location.getUrl() || location.getUrl().contains("localhost:8080")) {
  location.setUrl("http://localhost:8080/")
  location.save()
}

instance.setSystemMessage(
  "Student Attendance Management System — CI/CD controller. " +
  "This Jenkins instance is configured for local development."
)
instance.setNumExecutors(2)
instance.save()

println "Jenkins security initialized for user '${username}'."

import hudson.security.AuthorizationStrategy
import hudson.security.SecurityRealm
import jenkins.model.Jenkins
import jenkins.model.JenkinsLocationConfiguration

// Local demo only: no login and no signup. The Compose port is bound to
// 127.0.0.1 so the unsecured controller is not reachable from the network.
def instance = Jenkins.get()

instance.setSecurityRealm(SecurityRealm.NO_AUTHENTICATION)
instance.setAuthorizationStrategy(AuthorizationStrategy.UNSECURED)

def location = JenkinsLocationConfiguration.get()
if (!location.getUrl() || location.getUrl().contains("localhost:8080")) {
  location.setUrl("http://localhost:8080/")
  location.save()
}

instance.setSystemMessage(
  "Student Attendance Management System — CI/CD controller. " +
  "Local development instance with authentication disabled."
)
instance.setNumExecutors(2)
instance.save()

println "Jenkins authentication disabled for local development."

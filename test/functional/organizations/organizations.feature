Feature: Organizations

  Background:
    * url baseUrl
    * path endpointPath
    * configure readTimeout = 600000
  
  Scenario: Anyone signed-in can create organizations
    * table organizations 
      | currentUserEmail                      | name                | label
      | "test_donna@test.whitebrick.com"      | "test_donnas-media" | "Donna's Media"       
      | "test_donna@test.whitebrick.com"      | "test_admins-org"   | "Admins Test Org"     
      | "test_nick_north@test.whitebrick.com" | "test_vandelay"     | "Vandelay Industries" 
    * def result = call read("organization-create.feature") organizations
    * match each result[*].response contains { errors: "#notpresent" }
  
  Scenario: Organization admins can add users to organizations
    * table organizationUsers 
      | currentUserEmail                      | organizationName    | roleName                     | userEmails
      | "test_donna@test.whitebrick.com"      | "test_donnas-media" | "organization_user"          | ["test_debbie@test.whitebrick.com"]
      | "test_donna@test.whitebrick.com"      | "test_donnas-media" | "organization_external_user" | ["test_daisy@test.whitebrick.com"]
      | "test_donna@test.whitebrick.com"      | "test_admins-org"   | "organization_administrator" | ["test_daisy@test.whitebrick.com"]
      | "test_nick_north@test.whitebrick.com" | "test_vandelay"     | "organization_user"          | ["test_donna@test.whitebrick.com", "test_daisy@test.whitebrick.com"]
    * def result = call read("organization-set-users-role.feature") organizationUsers
    * match each result[*].response contains { errors: "#notpresent" }

  Scenario: Organization non-admins can not add users to organizations
    * table organizationUsers
      | currentUserEmail                 | organizationName    | roleName                     | userEmails
      | "test_daisy@test.whitebrick.com" | "test_vandelay"     | "organization_user"          | ["test_debbie@test.whitebrick.com"]
    * def result = call read("organization-set-users-role.feature") organizationUsers
    * print "========== EXPECTING ERROR =========="
    * match each result[*].response contains { errors: "#present" }
    * match each result[*].response.errors[*].extensions.wbCode == "WB_FORBIDDEN"

  Scenario: Organization non-admins can not remove users from an organization
    * table organizationUsers
      | currentUserEmail                 | organizationName    | userEmails
      | "test_daisy@test.whitebrick.com" | "test_vandelay"     | ["test_donna@test.whitebrick.com"]
    * def result = call read("organization-remove-users.feature") organizationUsers
    * print "========== EXPECTING ERROR =========="
    * match each result[*].response contains { errors: "#present" }
    * match each result[*].response.errors[*].extensions.wbCode == "WB_FORBIDDEN"


  Scenario: Organization admins can not remove all admins from an organization
    * table organizationUsers
      | currentUserEmail                      | organizationName    | userEmails
      | "test_nick_north@test.whitebrick.com" | "test_vandelay"     | ["test_daisy@test.whitebrick.com", "test_nick_north@test.whitebrick.com"]
    * def result = call read("organization-remove-users.feature") organizationUsers
    * print "========== EXPECTING ERROR =========="
    * match each result[*].response contains { errors: "#present" }
    * match each result[*].response.errors[*].extensions.wbCode == "WB_ORGANIZATION_NO_ADMINS"

  Scenario: Organization admins can remove users from an organization
    * table organizationUsers
      | currentUserEmail                      | organizationName    | userEmails
      | "test_nick_north@test.whitebrick.com" | "test_vandelay"     | ["test_donna@test.whitebrick.com", "test_daisy@test.whitebrick.com"]
    * def result = call read("organization-remove-users.feature") organizationUsers
    * match each result[*].response contains { errors: "#notpresent" }

  Scenario: Organization non-admins can not delete organizations
    * table organizations
      | currentUserEmail                 | name
      | "test_daisy@test.whitebrick.com" | "test_vandelay"
    * def result = call read("organization-delete.feature") organizations
    * print "========== EXPECTING ERROR =========="
    * match each result[*].response contains { errors: "#present" }
    * match each result[*].response.errors[*].extensions.wbCode == "WB_FORBIDDEN"

  Scenario: Organization admins can delete organizations
    * table organizations 
      | currentUserEmail                      | name
      | "test_nick_north@test.whitebrick.com" | "test_vandelay"
    * def result = call read("organization-delete.feature") organizations
    * match each result[*].response contains { errors: "#notpresent" }
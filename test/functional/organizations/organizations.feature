Feature: Organizations
  
  Scenario: Create organizations
    * table organizations 
      | currentUserEmail                      | name                | label
      | "test_donna@test.whitebrick.com"      | "test_donnas-media" | "Donna's Media"       
      | "test_donna@test.whitebrick.com"      | "test_admins-org"   | "Admins Test Org"     
      | "test_nick_north@test.whitebrick.com" | "test_vandelay"     | "Vandelay Industries" 
    * def result = call read("organizations/organization-create.feature") organizations
  
  Scenario: Organization administrators can add users to organizations
    * table organizationUsers 
      | currentUserEmail                      | organizationName    | role                         | userEmails
      | "test_donna@test.whitebrick.com"      | "test_donnas-media" | "organization_user"          | ["test_debbie@test.whitebrick.com"]
      | "test_donna@test.whitebrick.com"      | "test_donnas-media" | "organization_external_user" | ["test_daisy@test.whitebrick.com"]
      | "test_donna@test.whitebrick.com"      | "test_admins-org"   | "organization_administrator" | ["test_daisy@test.whitebrick.com"]
      | "test_nick_north@test.whitebrick.com" | "test_vandelay"     | "organization_user"          | ["test_donna@test.whitebrick.com", "test_daisy@test.whitebrick.com"]
    * def result = call read("organizations/organization-set-users-role.feature") organizationUsers
    * match result[0].response.errors == "#notpresent"

  Scenario: Non administrators can not add users to organizations
    * table organizationUsers
      | currentUserEmail                      | organizationName    | role                         | userEmails
      | "test_daisy@test.whitebrick.com"      | "test_vandelay"     | "organization_user"          | ["test_debbie@test.whitebrick.com"]
    * def result = call read("organizations/organization-set-users-role.feature") organizationUsers
    * match result[0].response.errors == "#present"
    * match result[0].response.errors[0].extensions.code == "FORBIDDEN"

  Scenario: Modify user role
    * table organizationUsers 
      | currentUserEmail                      | organizationName    | role                         | userEmails
      | "test_nick_north@test.whitebrick.com" | "test_vandelay"     | "organization_administrator" | ["test_donna@test.whitebrick.com"]
      | "test_nick_north@test.whitebrick.com" | "test_vandelay"     | "organization_external_user" | ["test_daisy@test.whitebrick.com"]
    * def result = call read("organizations/organization-set-users-role.feature") organizationUsers

  Scenario: Remove user from an organization
    * table organizationUsers 
      | currentUserEmail                      | organizationName    | userEmails
      | "test_nick_north@test.whitebrick.com" | "test_vandelay"     | ["test_daisy@test.whitebrick.com"]
    * def result = call read("organizations/organization-remove-user.feature") organizationUsers

  Scenario: Delete organization
    * table organizations 
      | currentUserEmail                      | name
      | "test_nick_north@test.whitebrick.com" | "test_vandelay"
    * def result = call read("organizations/organization-delete.feature") organizations
Feature: Permissions

  Scenario: Adding new organization admin should implicitly assign schema admin to organization-owned schemas
    * table organizationUsers 
      | organizationName    | role                         | userEmails
      | "test_admins-org"   | "organization_administrator" | ["test_nick_north@test.whitebrick.com"]
    * def result = call read("organizations/organization-set-users-role.feature") organizationUsers

  Scenario: Report permissions
    * karate.exec("bash report_permissions.bash")
  
  Scenario: Removing an organization admin should remove implicitly assigned schema admins
    * table organizationUsers 
      | organizationName    | userEmails
      | "test_admins-org"   | ["test_daisy@test.whitebrick.com"]
    * def result = call read("organizations/organization-remove-user.feature") organizationUsers

  Scenario: Report permissions
    * karate.exec("bash report_permissions.bash")
  
  Scenario: Demoting an organization admin to user should remove implicitly assigned schema admins
    * table organizationUsers 
      | organizationName    | role                | userEmails
      | "test_admins-org"   | "organization_user" | ["test_nick_north@test.whitebrick.com"]
    * def result = call read("organizations/organization-set-users-role.feature") organizationUsers

  Scenario: Report permissions
    * karate.exec("bash report_permissions.bash")

  Scenario: Setting a role explicitly should remove the implicit flag
    * table schemaUsers 
      | schemaName            | userEmails                          | role
      | "test_org_admins"     | ["test_donna@test.whitebrick.com"]  | "schema_administrator"
    * def result = call read("schemas/schema-add-user.feature") schemaUsers
  
  Scenario: Report permissions
    * karate.exec("bash report_permissions.bash")

  Scenario: Demote Donna from manager to reader, Promote debbie from reader to administrator
    * table organizationUsers 
      | schemaName            | userEmails                          | role
      | "test_the_daisy_blog" | ["test_donna@test.whitebrick.com"]  | "schema_reader"
      | "test_the_daisy_blog" | ["test_debbie@test.whitebrick.com"] | "schema_administrator"
    * def result = call read("schemas/schema-add-user.feature") organizationUsers

  Scenario: Remove debbie from schema
    * table organizationUsers 
      | schemaName            | userEmails
      | "test_the_daisy_blog" | ["test_debbie@test.whitebrick.com"]
    * def result = call read("schemas/schema-remove-user.feature") organizationUsers

  Scenario: Add nick north as administrator
    * table organizationUsers 
      | schemaName            | userEmails                              | role
      | "test_the_daisy_blog" | ["test_nick_north@test.whitebrick.com"] | "schema_administrator"
    * def result = call read("schemas/schema-add-user.feature") organizationUsers

    
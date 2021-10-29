Feature: Permissions

  Background:
    * url baseUrl
    * path endpointPath
    * configure readTimeout = 1200000

  Scenario: Adding new organization admin should implicitly assign schema admin and table admin to organization-owned schemas
    * karate.exec("bash report_permissions.bash")
    * table organizationUsers 
      | currentUserEmail                 | organizationName    | roleName                     | userEmails
      | "test_donna@test.whitebrick.com" | "test_admins-org"   | "organization_administrator" | ["test_nick_north@test.whitebrick.com"]
    * def result = call read("../organizations/organization-set-users-role.feature") organizationUsers
    * karate.exec("bash report_permissions.bash")
    * table users 
      | currentUserEmail                 | schemaName        | userEmails                              | tableName
      | "test_donna@test.whitebrick.com" | "test_org_admins" | ["test_nick_north@test.whitebrick.com"] | "test_table"
    * def result = call read("../schemas/schema-get-users.feature") users
    * match each result[*].response contains { errors: "#notpresent" }
    * match result[0].response.data.wbSchemaUsers[0].role.name == "schema_administrator"
    * match result[0].response.data.wbSchemaUsers[0].role.impliedFrom == "organization_administrator"
    * def result = call read("../tables/table-get-users.feature") users
    * match each result[*].response contains { errors: "#notpresent" }
    * match result[0].response.data.wbTableUsers[0].role.name == "table_administrator"
    * match result[0].response.data.wbTableUsers[0].role.impliedFrom == "schema_administrator"
  
  Scenario: Removing an organization admin should remove implicitly assigned schema and table admins
    * table organizationUsers 
      | currentUserEmail                 | organizationName    | userEmails
      | "test_donna@test.whitebrick.com" | "test_admins-org"   | ["test_daisy@test.whitebrick.com"]
    * def result = call read("../organizations/organization-remove-users.feature") organizationUsers
    * table users 
      | currentUserEmail                 | schemaName        | userEmails                         | tableName
      | "test_donna@test.whitebrick.com" | "test_org_admins" | ["test_daisy@test.whitebrick.com"] | "test_table"
    * def result = call read("../schemas/schema-get-users.feature") users
    * match each result[*].response contains { errors: "#notpresent" }
    * assert result[0].response.data.wbSchemaUsers.length == 0
    * def result = call read("../tables/table-get-users.feature") users
    * match each result[*].response contains { errors: "#notpresent" }
    * assert result[0].response.data.wbTableUsers.length == 0
    * karate.exec("bash report_permissions.bash")
  
  Scenario: Demoting an organization admin to user should remove implicitly assigned schema admins
    * table organizationUsers 
      | currentUserEmail                 | organizationName    | roleName            | userEmails
      | "test_donna@test.whitebrick.com" | "test_admins-org"   | "organization_user" | ["test_nick_north@test.whitebrick.com"]
    * def result = call read("../organizations/organization-set-users-role.feature") organizationUsers
    * match each result[*].response contains { errors: "#notpresent" }

  Scenario: Report permissions
    * karate.exec("bash report_permissions.bash")

  Scenario: Setting a role explicitly should remove the implicit flag
    * table schemaUsers 
      | currentUserEmail                 | schemaName            | userEmails                          | roleName
      | "test_donna@test.whitebrick.com" | "test_org_admins"     | ["test_donna@test.whitebrick.com"]  | "schema_administrator"
    * def result = call read("../schemas/schema-set-users-role.feature") schemaUsers
    * match each result[*].response contains { errors: "#notpresent" }
  
  Scenario: Report permissions
    * karate.exec("bash report_permissions.bash")

  Scenario: Demote Donna from manager to reader, Promote debbie from reader to administrator
    * table organizationUsers 
      | currentUserEmail                 | schemaName            | userEmails                          | roleName
      | "test_daisy@test.whitebrick.com" | "test_the_daisy_blog" | ["test_donna@test.whitebrick.com"]  | "schema_reader"
      | "test_daisy@test.whitebrick.com" | "test_the_daisy_blog" | ["test_debbie@test.whitebrick.com"] | "schema_administrator"
    * def result = call read("../schemas/schema-set-users-role.feature") organizationUsers
    * match each result[*].response contains { errors: "#notpresent" }

  Scenario: Remove debbie from schema
    * table organizationUsers 
      | currentUserEmail                 | schemaName            | userEmails
      | "test_daisy@test.whitebrick.com" | "test_the_daisy_blog" | ["test_debbie@test.whitebrick.com"]
    * def result = call read("../schemas/schema-remove-users.feature") organizationUsers
    * match each result[*].response contains { errors: "#notpresent" }

  Scenario: Add nick north as administrator for schema
    * table schemaUsers 
      | currentUserEmail                 | schemaName            | userEmails                              | roleName
      | "test_daisy@test.whitebrick.com" | "test_the_daisy_blog" | ["test_nick_north@test.whitebrick.com"] | "schema_administrator"
    * def result = call read("../schemas/schema-set-users-role.feature") schemaUsers
    * match each result[*].response contains { errors: "#notpresent" }

  Scenario: Remove donna from a single table, add back to same table as table_manager
    * karate.exec("bash report_permissions.bash")
    * table tableUsers 
      | currentUserEmail                 | schemaName            | tableName | userEmails                         | roleName
      | "test_daisy@test.whitebrick.com" | "test_the_daisy_blog" | "posts"   | ["test_donna@test.whitebrick.com"] | "table_manager"
    # check already a user
    * def result = call read("../tables/table-get-users.feature") tableUsers
    * match each result[*].response contains { errors: "#notpresent" }
    * assert result[0].response.data.wbTableUsers.length == 1
    # remove user
    * def result = call read("../tables/table-remove-users.feature") tableUsers
    * match each result[*].response contains { errors: "#notpresent" }
    * karate.exec("bash report_permissions.bash")
    # check removed
    * def result = call read("../tables/table-get-users.feature") tableUsers
    * match each result[*].response contains { errors: "#notpresent" }
    * assert result[0].response.data.wbTableUsers.length == 0
    # add back with table_manager
    * def result = call read("../tables/table-set-users-role.feature") tableUsers
    * match each result[*].response contains { errors: "#notpresent" }
    * karate.exec("bash report_permissions.bash")
    # check
    * def result = call read("../tables/table-get-users.feature") tableUsers
    * match each result[*].response contains { errors: "#notpresent" }
    * match result[0].response.data.wbTableUsers[0].role.name == "table_manager"

    
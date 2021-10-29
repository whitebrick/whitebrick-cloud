Feature: Schemas

  Background:
    * url baseUrl
    * path endpointPath
    * configure readTimeout = 1200000
  
  Scenario: Anyone signed-in can create a schema

    # A schema can be created with either a organization owner or a user owner
    * table schemas 
      | currentUserEmail                  | name                          | label                              | organizationOwnerName | userOwnerEmail
      | "test_daisy@test.whitebrick.com"  | "test_the_daisy_blog"         | "The Daisy Blog"                   | null                  | "test_daisy@test.whitebrick.com"
      | "test_donna@test.whitebrick.com"  | "test_org_admins"             | "Test with Org Admins"             | "test_admins-org"     | null
      | "test_debbie@test.whitebrick.com" | "test_donnas_org_non_admin"   | "Test with Donnas Media Non-Admin" | "test_donnas-media"   | null
    * def result = call read("schema-create.feature") schemas
    * match each result[*].response contains { errors: "#notpresent" }

  Scenario: Schema admins can add users to schemas
    * karate.exec("bash report_permissions.bash")
    * table schemaUsers 
      | currentUserEmail                 | schemaName            | userEmails                          | roleName
      | "test_daisy@test.whitebrick.com" | "test_the_daisy_blog" | ["test_donna@test.whitebrick.com"]  | "schema_manager"
      | "test_daisy@test.whitebrick.com" | "test_the_daisy_blog" | ["test_debbie@test.whitebrick.com"] | "schema_reader"
      | "test_donna@test.whitebrick.com" | "test_org_admins"     | ["test_debbie@test.whitebrick.com"] | "schema_administrator"
    * def result = call read("schema-set-users-role.feature") schemaUsers
    * match each result[*].response contains { errors: "#notpresent" }

  Scenario: Schema non-admins can not add users to schemas
    * karate.exec("bash report_permissions.bash")
    * table schemaUsers 
      | currentUserEmail                  | schemaName            | userEmails                              | roleName
      | "test_debbie@test.whitebrick.com" | "test_the_daisy_blog" | ["test_nick_north@test.whitebrick.com"] | "schema_reader"
    * def result = call read("schema-set-users-role.feature") schemaUsers
    * print "========== EXPECTING ERROR =========="
    * match each result[*].response contains { errors: "#present" }
    * match each result[*].response.errors[*].extensions.wbCode == "WB_FORBIDDEN"
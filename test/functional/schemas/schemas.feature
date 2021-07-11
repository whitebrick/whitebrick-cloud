Feature: Schemas 
  
  Scenario: Create test schemas

    # A schema can be created with either a organization owner or a user owner
    * table schemas 
      | currentUserEmail                  | name                          | label                              | organizationOwnerName | userOwnerEmail
      | "test_daisy@test.whitebrick.com"  | "test_the_daisy_blog"         | "The Daisy Blog"                   | null                  | "test_daisy@test.whitebrick.com"
      | "test_donna@test.whitebrick.com"  | "test_org_admins"             | "Test with Org Admins"             | "test_admins-org"     | null
      | "test_debbie@test.whitebrick.com" | "test_donnas_org_non_admin"   | "Test with Donnas Media Non-Admin" | "test_donnas-media"   | null
    * def result = call read("schemas/schema-create.feature") schemas

  Scenario: Add users to schemas
    * table schemaUsers 
      | schemaName            | userEmails                          | roleName
      | "test_the_daisy_blog" | ["test_donna@test.whitebrick.com"]  | "schema_manager"
      | "test_the_daisy_blog" | ["test_debbie@test.whitebrick.com"] | "schema_reader"
      | "test_org_admins"     | ["test_debbie@test.whitebrick.com"] | "schema_administrator"
    * def result = call read("schemas/schema-set-users-role.feature") schemaUsers
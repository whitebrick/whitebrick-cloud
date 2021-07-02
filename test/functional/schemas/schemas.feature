Feature: Schemas 
  
  Scenario: Create test schemas

    # A schema can be created with either a organization owner or a user owner
    * table schemas 
      | currentUserEmail                  | name                   | label                | organizationOwnerName | userOwnerEmail
      | 'test_daisy@test.whitebrick.com'  | 'test_the_daisy_blog'  | 'The Daisy Blog'     | null                  | 'test_daisy@test.whitebrick.com'
      | 'test_debbie@test.whitebrick.com' | 'test_org_non_admin'   | 'Test Org Non-Admin' | 'test_donnas-media'   | null
      | 'test_donna@test.whitebrick.com'  | 'test_3-admins-schema' | 'Test 3 Admins'      | 'test_3-admins-org'   | null
    * def result = call read('schemas/schema-create.feature') schemas

  Scenario: Add users to schemas
    * table organizationUsers 
      | schemaName            | userEmails                          | role
      | 'test_the_daisy_blog' | ['test_donna@test.whitebrick.com']  | 'schema_manager'
      | 'test_the_daisy_blog' | ['test_debbie@test.whitebrick.com'] | 'schema_reader'
    * def result = call read('schemas/schema-add-user.feature') organizationUsers
Feature: Schemas 
  
  Scenario: Create test schemas

    # A schema can be created with either a organization owner or a user owner
    * table schemas 
      # change currentUserEmail to uid
      | currentUserEmail                      | name                   | label                   | organizationOwnerName | userOwnerEmail
      | 'test_daisy@test.whitebrick.com'      | 'test_the_daisy_blog'  | 'The Daisy Blog'        | null                  | 'test_daisy@test.whitebrick.com'
      | 'test_debbie@test.whitebrick.com'     | 'test_org_non_admin'   | 'Test Org Non-Admin'    | 'test_donnas-media'   | null
    * def result = call read('schemas/schema-create.feature') schemas

Feature: Schemas 
  
  Scenario: Create test schemas

    # A schema can be created with either a tenant owner or a user owner
    * table schemas 
      | name | label | tenantOwnerName | userOwnerEmail |
      # existing test DBs
      | 'test_donnasdvd' | 'Donnas DVD DB' | 'test_donnas-media' |   |
      | 'test_chinook' | 'Chinook Music DB' | 'test_donnas-media' |   |
      | 'test_northwind' | 'Northwind Supplies DB' | null  | 'test_nick_north@test.whitebrick.com'|
      # new empty test DB
      | 'test_the_daisy_blog' | 'The Daisy Blog' | null  | 'test_daisy@test.whitebrick.com'|
    * def result = call read('schemas/schema-create.feature') schemas
  
  
  Scenario: Add users to schemas
    * table tenantUsers 
      | schemaName | userEmail | schemaRole
      | 'test_donnasdvd' | 'test_donna@test.whitebrick.com' | 'schema_administrator' |
      | 'test_donnasdvd' | 'test_debbie@test.whitebrick.com' | 'schema_editor' |
      | 'test_donnasdvd' | 'test_daisy@test.whitebrick.com' | 'schema_reader' |
      | 'test_chinook' | 'test_donna@test.whitebrick.com' | 'schema_administrator' |
      | 'test_chinook' | 'test_debbie@test.whitebrick.com' | 'schema_reader' |
      | 'test_chinook' | 'test_daisy@test.whitebrick.com' | 'schema_editor' |
      | 'test_northwind' | 'test_debbie@test.whitebrick.com' | 'schema_reader' |
    * def result = call read('schemas/schema-add-user.feature') tenantUsers

  # Scenario: Load test data for existing DBs
  #   * karate.exec("bash load_test_schemas.bash")
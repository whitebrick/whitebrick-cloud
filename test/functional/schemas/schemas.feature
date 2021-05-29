Feature: Schemas 
  @setup
  Scenario: Create test schemas
    * table schemas 
      | name | label | tenantOwnerName | userOwnerEmail |
      | 'test_donnasdvd' | 'Donnas DVD DB' | 'test_donnas-media' |   |
      | 'test_chinook' | 'Chinook Music DB' | 'test_donnas-media' |   |
      | 'test_northwind' | 'Northwind Supplies DB' | null  | 'test_nick_north@test.whitebrick.com'|
    * def result = call read('schemas/schema-create.feature') schemas
    * def created = $result[*].response
  
  @setup
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
    * def created = $result[*].response

  @setup
  Scenario: Load test data
    * karate.exec("bash load_test_schemas.bash")
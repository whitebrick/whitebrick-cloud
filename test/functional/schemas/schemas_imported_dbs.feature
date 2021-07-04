Feature: Schemas 

  Scenario: Create test schemas for imported DBs

    # A schema can be created with either a organization owner or a user owner
    * table schemas 
      | currentUserEmail                      | name                   | label                   | organizationOwnerName | userOwnerEmail
      | "test_donna@test.whitebrick.com"      | "test_donnasdvd"       | "Donna's DVD DB"        | "test_donnas-media"   | null
      | "test_debbie@test.whitebrick.com"     | "test_chinook"         | "Chinook Music DB"      | "test_donnas-media"   | null
      | "test_nick_north@test.whitebrick.com" | "test_northwind"       | "Northwind Supplies DB" | null                  | "test_nick_north@test.whitebrick.com"      
    * def result = call read("schemas/schema-create.feature") schemas
  
  Scenario: Add users to schemas
    * table schemaUsers 
      | schemaName       | userEmails                          | role
      | "test_donnasdvd" | ["test_donna@test.whitebrick.com"]  | "schema_administrator"
      | "test_donnasdvd" | ["test_debbie@test.whitebrick.com"] | "schema_editor"
      | "test_donnasdvd" | ["test_daisy@test.whitebrick.com"]  | "schema_reader"
      | "test_chinook"   | ["test_donna@test.whitebrick.com"]  | "schema_administrator"
      | "test_chinook"   | ["test_debbie@test.whitebrick.com"] | "schema_reader"
      | "test_chinook"   | ["test_daisy@test.whitebrick.com"]  | "schema_editor"
      | "test_northwind" | ["test_debbie@test.whitebrick.com"] | "schema_reader"
    * def result = call read("schemas/schema-add-user.feature") schemaUsers

  Scenario: Load test data for imported DBs
    * karate.exec("bash load_test_schemas.bash")
Feature: Import existing DBs

  Background:
    * url baseUrl
    * path endpointPath
    * configure readTimeout = 600000

  Scenario: Create test schemas for imported DBs
    * table schemas 
      | currentUserEmail                      | name                   | label                   | organizationOwnerName | userOwnerEmail
      | "test_donna@test.whitebrick.com"      | "test_donnasdvd"       | "Donna's DVD DB"        | "test_donnas-media"   | null
      | "test_debbie@test.whitebrick.com"     | "test_chinook"         | "Chinook Music DB"      | "test_donnas-media"   | null
      | "test_nick_north@test.whitebrick.com" | "test_northwind"       | "Northwind Supplies DB" | null                  | "test_nick_north@test.whitebrick.com"      
    * def result = call read("../schemas/schema-create.feature") schemas
    * match each result[*].response contains { errors: "#notpresent" }
  
  Scenario: Add users to schemas
    * table schemaUsers 
      | currentUserEmail                      | schemaName       | userEmails                          | roleName
      | "test_donna@test.whitebrick.com"      | "test_donnasdvd" | ["test_debbie@test.whitebrick.com"] | "schema_editor"
      | "test_donna@test.whitebrick.com"      | "test_donnasdvd" | ["test_daisy@test.whitebrick.com"]  | "schema_reader"
      | "test_donna@test.whitebrick.com"      | "test_chinook"   | ["test_donna@test.whitebrick.com"]  | "schema_administrator"
      | "test_donna@test.whitebrick.com"      | "test_chinook"   | ["test_debbie@test.whitebrick.com"] | "schema_reader"
      | "test_donna@test.whitebrick.com"      | "test_chinook"   | ["test_daisy@test.whitebrick.com"]  | "schema_editor"
      | "test_nick_north@test.whitebrick.com" | "test_northwind" | ["test_debbie@test.whitebrick.com"] | "schema_reader"
    * def result = call read("../schemas/schema-set-users-role.feature") schemaUsers
    * match each result[*].response contains { errors: "#notpresent" }

  Scenario: Load test data for imported DBs
    * def proc = karate.fork("bash load_test_schemas.bash")
    * proc.waitSync()
    * match proc.exitCode == 0

  Scenario: Add tables and relationships from existing DBs
    * print "========== Adding all of the tables and relationships may take up to 15 minutes =========="
    * table schemas 
      | currentUserEmail                      | schemaName
      | "test_donna@test.whitebrick.com"      | "test_donnasdvd"
      | "test_donna@test.whitebrick.com"      | "test_chinook"
      | "test_nick_north@test.whitebrick.com" | "test_northwind"
    * def result = call read("../tables/table-add-existing.feature") schemas
    * match each result[*].response contains { errors: "#notpresent" }
    * def result = call read("../tables/table-add-existing-relationships.feature") schemas
    * match each result[*].response contains { errors: "#notpresent" }

  Scenario: Create and track test table in imported/existing DB
    * table tables 
      | currentUserEmail                      | schemaName       | tableName    | tableLabel
      | "test_donna@test.whitebrick.com"      | "test_donnasdvd" | "test_table" | "Donnas DVD Test Table"
    * def result = call read("../tables/table-create.feature") tables
    * match each result[*].response contains { errors: "#notpresent" }

  Scenario: Relabel test table in imported/existing DB
    * table tables 
      | currentUserEmail                      | schemaName       | tableName    | newTableName | newTableLabel
      | "test_donna@test.whitebrick.com"      | "test_donnasdvd" | "test_table" | null         | "Test Table Relabeled"
    * def result = call read("../tables/table-update.feature") tables
    * match each result[*].response contains { errors: "#notpresent" }
  
  Scenario: Rename test table in imported/existing DB
    * table tables 
      | currentUserEmail                      | schemaName       | tableName    | newTableName         | newTableLabel
      | "test_donna@test.whitebrick.com"      | "test_donnasdvd" | "test_table" | "test_table_renamed" | null
    * def result = call read("../tables/table-update.feature") tables
    * match each result[*].response contains { errors: "#notpresent" }
    
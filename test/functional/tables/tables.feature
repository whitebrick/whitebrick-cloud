Feature: Tables 

  @setup
  Scenario: Add all existing tables
    * table schemas 
      | schemaName |
      | 'test_chinook'   |
      | 'test_donnasdvd' |
      | 'test_northwind' |
    * def result = call read('tables/table-add-existing.feature') schemas
    * def created = $result[*].response

  @setup
  Scenario: Create and track test table in existing DB
    * table tables 
      | schemaName | tableName | tableLabel
      | 'test_donnasdvd' | 'test_table' | 'Donnas DVD Test Table'
    * def result = call read('tables/table-create.feature') tables

  @setup
  Scenario: Rename test table in existing DB
    * table tables 
      | schemaName | tableName | newTableName
      | 'test_donnasdvd' | 'test_table' | 'test_table_renamed'
    * def result = call read('tables/table-rename.feature') tables

 @setup
  Scenario: Relabel test table in existing DB
    * table tables 
      | schemaName | tableName | newTableLabel
      | 'test_donnasdvd' | 'test_table_renamed' | 'Test Table Relabeled'
    * def result = call read('tables/table-relabel.feature') tables
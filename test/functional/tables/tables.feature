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
  Scenario: Create and track test tables
    * table tables 
      | schemaName | tableName | tableLabel
      | 'test_chinook'   | 'test_table' | 'Chinook Test Table'
      | 'test_donnasdvd' | 'test_table' | 'Donnas DVD Test Table'
      | 'test_northwind' | 'test_table' | 'Northwind Test Table'
    * def result = call read('tables/table-create.feature') tables
    * def created = $result[*].response

  @setup
  Scenario: Rename test tables
    * table tables 
      | schemaName | tableName | newTableName
      | 'test_chinook'   | 'test_table' | 'test_table_renamed'
      | 'test_donnasdvd' | 'test_table' | 'test_table_renamed'
      | 'test_northwind' | 'test_table' | 'test_table_renamed'
    * def result = call read('tables/table-rename.feature') tables
    * def created = $result[*].response

 @setup
  Scenario: Relabel test tables
    * table tables 
      | schemaName | tableName | newTableLabel
      | 'test_chinook'   | 'test_table_renamed' | 'Test Table Relabeled'
      | 'test_donnasdvd' | 'test_table_renamed' | 'Test Table Relabeled'
      | 'test_northwind' | 'test_table_renamed' | 'Test Table Relabeled'
    * def result = call read('tables/table-relabel.feature') tables
    * def created = $result[*].response
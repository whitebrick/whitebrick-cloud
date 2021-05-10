Feature: Tables 

  @setup
  Scenario: Track all existing tables
    * table schemas 
      | schemaName |
      | 'test_chinook'   |
      | 'test_donnasdvd' |
      | 'test_northwind' |
    * def result = call read('schemas/table-track-all.feature') schemas
    * def created = $result[*].response

  @setup
  Scenario: Create and track test tables
    * table tables 
      | schemaName | tableName |
      | 'test_chinook'   | 'test_table' |      
      | 'test_donnasdvd' | 'test_table' |
      | 'test_northwind' | 'test_table' |
    * def result = call read('schemas/table-create.feature') tables
    * def created = $result[*].response
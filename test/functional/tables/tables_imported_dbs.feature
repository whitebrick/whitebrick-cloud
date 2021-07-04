Feature: Tables

  Background:
    * url baseUrl
    * path endpointPath
    * configure readTimeout = 600000

  Scenario: Add tables and relationships from existing DBs
    * table schemas 
      | schemaName |
      | "test_chinook"   |
      | "test_donnasdvd" |
      | "test_northwind" |
    * def result = call read("tables/table-add-existing.feature") schemas
    * def result = call read("tables/table-add-existing-relationships.feature") schemas

  Scenario: Create and track test table in imported/existing DB
    * table tables 
      | schemaName | tableName | tableLabel
      | "test_donnasdvd" | "test_table" | "Donnas DVD Test Table"
    * def result = call read("tables/table-create.feature") tables

  Scenario: Relabel test table in imported/existing DB
    * table tables 
      | schemaName       | tableName    | newTableName | newTableLabel
      | "test_donnasdvd" | "test_table" | null         | "Test Table Relabeled"
    * def result = call read("tables/table-update.feature") tables
  
  Scenario: Rename test table in imported/existing DB
    * table tables 
      | schemaName       | tableName    | newTableName         | newTableLabel
      | "test_donnasdvd" | "test_table" | "test_table_renamed" | null
    * def result = call read("tables/table-update.feature") tables
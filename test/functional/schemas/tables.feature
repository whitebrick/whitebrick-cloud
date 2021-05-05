Feature: Tables 
  @setup
  Scenario: Create test tables
    * table tables 
      | schemaName | tableName |
      | 'test_blog' | 'posts' |
    * def result = call read('schemas/table-create.feature') tables
    * def created = $result[*].response
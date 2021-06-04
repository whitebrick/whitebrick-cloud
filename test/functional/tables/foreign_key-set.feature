Feature:

  Background:
    * def wb = call read('classpath:init.feature')
    * url wb.baseUrl
    * path wb.endpointPath
  Scenario: Set foreign key
    Given text query = 
    """
      mutation ($schemaName: String!, $tableName: String!, $columnNames: [String]!, $parentTableName: String, $parentColumnNames: [String]!){
        wbSetForeignKey(
          schemaName: $schemaName,
          tableName: $tableName,
          columnNames: $columnNames,
          parentTableName: $parentTableName,
          parentColumnNames: $parentColumnNames
        )
      }
    """
    And def variables = { schemaName: '#(schemaName)', tableName: '#(tableName)', columnNames: '#(columnNames)', parentTableName: '#(parentTableName)', parentColumnNames: '#(parentColumnNames)'}
    And request { query: '#(query)', variables: '#(variables)' }
    When method POST
    Then status 200
    Then print response
    Then match response.errors == '#notpresent'
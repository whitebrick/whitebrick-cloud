Feature:

  Background:
    * url baseUrl
    * path endpointPath
  Scenario: Ad or create a foreign key
    Given text query = 
    """
      mutation ($schemaName: String!, $tableName: String!, $columnNames: [String]!, $parentTableName: String!, $parentColumnNames: [String]!, $create: Boolean){
        wbAddOrCreateForeignKey(
          schemaName: $schemaName,
          tableName: $tableName,
          columnNames: $columnNames,
          parentTableName: $parentTableName,
          parentColumnNames: $parentColumnNames,
          create: $create
        )
      }
    """
    And def variables = { schemaName: '#(schemaName)', tableName: '#(tableName)', columnNames: '#(columnNames)', parentTableName: '#(parentTableName)', parentColumnNames: '#(parentColumnNames)', create: '#(create)'}
    And request { query: '#(query)', variables: '#(variables)' }
    When method POST
    Then status 200
    Then print response
    Then match response.errors == '#notpresent'
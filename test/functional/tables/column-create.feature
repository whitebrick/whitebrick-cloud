Feature:

  Background:
    * url baseUrl
    * path endpointPath
    
  Scenario: Create a column
    Given text query = 
    """
      mutation ($schemaName: String!, $tableName: String!, $columnName: String!, $columnLabel: String!, $columnType: String){
        wbAddOrCreateColumn(
          schemaName: $schemaName,
          tableName: $tableName,
          columnName: $columnName,
          columnLabel: $columnLabel,
          columnType: $columnType,
          create: true
        )
      }
    """
    And def variables = { schemaName: '#(schemaName)', tableName: '#(tableName)', columnName: '#(columnName)', columnLabel: '#(columnLabel)', columnType: '#(columnType)'}
    And request { query: '#(query)', variables: '#(variables)' }
    When method POST
    Then status 200
    Then print response
    Then match response.errors == '#notpresent'
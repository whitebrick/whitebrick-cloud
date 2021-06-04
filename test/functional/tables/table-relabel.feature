Feature:

  Background:
    * url baseUrl
    * path endpointPath
  Scenario: Relabel a table
    Given text query = 
    """
      mutation ($schemaName: String!, $tableName: String!, $newTableLabel: String){
        wbUpdateTable(schemaName: $schemaName, tableName: $tableName, newTableLabel: $newTableLabel)
      }
    """
    And def variables = { schemaName: '#(schemaName)', tableName: '#(tableName)', newTableLabel: '#(newTableLabel)'}
    And request { query: '#(query)', variables: '#(variables)' }
    When method POST
    Then status 200
    Then print response
    Then match response.errors == '#notpresent'
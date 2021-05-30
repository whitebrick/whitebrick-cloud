Feature:

  Background:
    * def wb = call read('classpath:init.feature')
    * url wb.baseUrl
    * path wb.endpointPath

  Scenario: Rename a table
    Given text query = 
    """
      mutation ($schemaName: String!, $tableName: String!, $newTableName: String){
        wbUpdateTable(schemaName: $schemaName, tableName: $tableName, newTableName: $newTableName)
      }
    """
    And def variables = { schemaName: '#(schemaName)', tableName: '#(tableName)', newTableName: '#(newTableName)'}
    And request { query: '#(query)', variables: '#(variables)' }
    When method POST
    Then status 200
    Then print response
    Then match response.errors == '#notpresent'
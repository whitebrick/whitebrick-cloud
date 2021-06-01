Feature:

  Background:
    * def wb = call read('classpath:init.feature')
    * url wb.baseUrl
    * path wb.endpointPath

  Scenario: Create a table
    Given text query = 
    """
      mutation ($schemaName: String!, $tableName: String!, $tableLabel: String!){
        wbAddOrCreateTable(schemaName: $schemaName, tableName: $tableName, tableLabel: $tableLabel, create: true)
      }
    """
    And def variables = { schemaName: '#(schemaName)', tableName: '#(tableName)', tableLabel: '#(tableLabel)'}
    And request { query: '#(query)', variables: '#(variables)' }
    When method POST
    Then status 200
    Then print response
    Then match response.errors == '#notpresent'
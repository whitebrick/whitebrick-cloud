Feature:

  Background:
    * url baseUrl
    * path endpointPath

  Scenario: Create a table
    Given text query = 
    """
      mutation ($schemaName: String!, $tableName: String!, $tableLabel: String!){
        wbAddOrCreateTable(schemaName: $schemaName, tableName: $tableName, tableLabel: $tableLabel, create: true){
          name
        }
      }
    """
    And def variables = { schemaName: "#(schemaName)", tableName: "#(tableName)", tableLabel: "#(tableLabel)"}
    And request { query: "#(query)", variables: "#(variables)" }
    And header X-Test-User-Email = currentUserEmail
    When method POST
    Then status 200
    Then print response
    
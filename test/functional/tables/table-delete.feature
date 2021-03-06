Feature:

  Background:
    * url baseUrl
    * path endpointPath

  Scenario: Delete a table
    Given text query = 
    """
      mutation ($schemaName: String!, $tableName: String!){
        wbRemoveOrDeleteTable(schemaName: $schemaName, tableName: $tableName, del: true)
      }
    """
    And def variables = { schemaName: "#(schemaName)", tableName: "#(tableName)"}
    And request { query: "#(query)", variables: "#(variables)" }
    And header X-Test-User-Email = currentUserEmail
    When method POST
    Then status 200
    Then print response
    
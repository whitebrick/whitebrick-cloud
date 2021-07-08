Feature:

  Background:
    * url baseUrl
    * path endpointPath
    
  Scenario: Delete a column
    Given text query = 
    """
      mutation ($schemaName: String!, $tableName: String!, $columnName: String!){
        wbRemoveOrDeleteColumn(
          schemaName: $schemaName,
          tableName: $tableName,
          columnName: $columnName,
          del: true
        )
      }
    """
    And def variables = { schemaName: "#(schemaName)", tableName: "#(tableName)", columnName: "#(columnName)"}
    And request { query: "#(query)", variables: "#(variables)" }
    And header X-Test-User-Email = "test_donna@test.whitebrick.com"
    When method POST
    Then status 200
    Then print response
    Then match response.errors == "#notpresent"
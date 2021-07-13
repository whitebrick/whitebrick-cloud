Feature:

  Background:
    * url baseUrl
    * path endpointPath
    
  Scenario: Create or delete primary key
    Given text query = 
    """
      mutation ($schemaName: String!, $tableName: String!, $columnNames: [String]!, $del: Boolean!){
        wbCreateOrDeletePrimaryKey(
          schemaName: $schemaName,
          tableName: $tableName,
          columnNames: $columnNames,
          del: $del
        )
      }
    """
    And def variables = { schemaName: "#(schemaName)", tableName: "#(tableName)", columnNames: "#(columnNames)", del: "#(del)"}
    And request { query: "#(query)", variables: "#(variables)" }
    And header X-Test-User-Email = currentUserEmail
    When method POST
    Then status 200
    Then print response
    
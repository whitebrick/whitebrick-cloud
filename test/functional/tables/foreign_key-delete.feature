Feature:

  Background:
    * url baseUrl
    * path endpointPath
    
  Scenario: Remove or Delete a foreign key
    Given text query = 
    """
      mutation ($schemaName: String!, $tableName: String!, $columnNames: [String]!, $parentTableName: String!, $del: Boolean){
        wbRemoveOrDeleteForeignKey(
          schemaName: $schemaName,
          tableName: $tableName,
          columnNames: $columnNames,
          parentTableName: $parentTableName,
          del: $del
        )
      }
    """
    And def variables = { schemaName: "#(schemaName)", tableName: "#(tableName)", columnNames: "#(columnNames)", parentTableName: "#(parentTableName)", del: "#(del)"}
    And request { query: "#(query)", variables: "#(variables)" }
    And header X-Test-User-Email = currentUserEmail
    When method POST
    Then status 200
    Then print response
    
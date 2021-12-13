Feature:

  Background:
    * url baseUrl
    * path endpointPath
    
  Scenario: Create a column
    Given text query = 
    """
      mutation ($schemaName: String!, $tableName: String!, $columnName: String!, $columnLabel: String!, $columnType: String, $isNotNullable: Boolean){
        wbAddOrCreateColumn(
          schemaName: $schemaName,
          tableName: $tableName,
          columnName: $columnName,
          columnLabel: $columnLabel,
          create: true
          columnType: $columnType,
          isNotNullable: $isNotNullable,
          skipTracking: false,
          sync: true
        )
      }
    """
    And def variables = { schemaName: "#(schemaName)", tableName: "#(tableName)", columnName: "#(columnName)", columnLabel: "#(columnLabel)", columnType: "#(columnType)", isNotNullable: "#(isNotNullable)"}
    And request { query: "#(query)", variables: "#(variables)" }
    And header X-Test-User-Email = currentUserEmail
    When method POST
    Then status 200
    Then print response
    
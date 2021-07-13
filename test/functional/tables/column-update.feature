Feature:

  Background:
    * url baseUrl
    * path endpointPath
    * def newColumnNameChk = typeof newColumnName == "undefined" ? null : newColumnName
    * def newColumnLabelChk = typeof newColumnLabel == "undefined" ? null : newColumnLabel
    * def newTypeChk = typeof newType == "undefined" ? null : newType

  Scenario: Update a column
    Given text query = 
    """
      mutation ($schemaName: String!, $tableName: String!, $columnName: String!, $newColumnName: String, $newColumnLabel: String, $newType: String){
        wbUpdateColumn(
          schemaName: $schemaName,
          tableName: $tableName,
          columnName: $columnName,
          newColumnName: $newColumnName,
          newColumnLabel: $newColumnLabel,
          newType: $newType
        )
      }
    """
    And def variables = { schemaName: "#(schemaName)", tableName: "#(tableName)", columnName: "#(columnName)", newColumnName: "#(newColumnNameChk)", newColumnLabel: "#(newColumnLabelChk)", newType: "#(newTypeChk)"}
    And request { query: "#(query)", variables: "#(variables)" }
    And header X-Test-User-Email = currentUserEmail
    When method POST
    Then status 200
    Then print response
    
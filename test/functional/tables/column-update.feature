Feature:

  Background:
    * url baseUrl
    * path endpointPath
    * def newColumnNameChk = typeof newColumnName == "undefined" ? null : newColumnName
    * def newColumnLabelChk = typeof newColumnLabel == "undefined" ? null : newColumnLabel
    * def newTypeChk = typeof newType == "undefined" ? null : newType
    * def newIsNotNullableChk = typeof newIsNotNullable == "undefined" ? null : newIsNotNullable

  Scenario: Update a column
    Given text query = 
    """
      mutation ($schemaName: String!, $tableName: String!, $columnName: String!, $newColumnName: String, $newColumnLabel: String, $newType: String, $newIsNotNullable: Boolean){
        wbUpdateColumn(
          schemaName: $schemaName,
          tableName: $tableName,
          columnName: $columnName,
          newColumnName: $newColumnName,
          newColumnLabel: $newColumnLabel,
          newType: $newType,
          newIsNotNullable: $newIsNotNullable,
          skipTracking: false,
          sync: true
        )
      }
    """
    And def variables = { schemaName: "#(schemaName)", tableName: "#(tableName)", columnName: "#(columnName)", newColumnName: "#(newColumnNameChk)", newColumnLabel: "#(newColumnLabelChk)", newType: "#(newTypeChk)", newIsNotNullable: "#(newIsNotNullableChk)"}
    And request { query: "#(query)", variables: "#(variables)" }
    And header X-Test-User-Email = currentUserEmail
    When method POST
    Then status 200
    Then print response
    
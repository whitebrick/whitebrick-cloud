Feature:

  Background:
    * url baseUrl
    * path endpointPath
    * def newTableNameChk = typeof newTableName == 'undefined' ? null : newTableName
    * def newTableLabelChk = typeof newTableLabel == 'undefined' ? null : newTableLabel
    
  Scenario: Re-name or re-label a table
    Given text query = 
    """
      mutation ($schemaName: String!, $tableName: String!, $newTableName: String, $newTableLabel: String){
        wbUpdateTable(schemaName: $schemaName, tableName: $tableName, newTableName: $newTableName, newTableLabel: $newTableLabel)
      }
    """
    And def variables = { schemaName: '#(schemaName)', tableName: '#(tableName)', newTableName: '#(newTableNameChk)', newTableLabel: '#(newTableLabelChk)'}
    And request { query: '#(query)', variables: '#(variables)' }
    When method POST
    Then status 200
    Then print response
    Then match response.errors == '#notpresent'
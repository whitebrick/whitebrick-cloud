Feature:

  Background:
    * def wb = call read('classpath:init.feature')
    * url wb.baseUrl
    * path wb.endpointPath
  Scenario: Set primary key
    Given text query = 
    """
      mutation ($schemaName: String!, $tableName: String!){
        wbSetPrimaryKey(
          schemaName: $schemaName,
          tableName: $tableName,
          columnNames: ["id"]
        )
      }
    """
    And def variables = { schemaName: '#(schemaName)', tableName: '#(tableName)'}
    And request { query: '#(query)', variables: '#(variables)' }
    When method POST
    Then status 200
    Then print response
    Then match response.errors == '#notpresent'
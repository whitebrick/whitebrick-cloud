Feature:

  Background:
    * def wb = call read('classpath:init.feature')
    * url wb.baseUrl
    * path wb.endpointPath

    Scenario: Add all existing tables
    Given text query = 
    """
      mutation ($schemaName: String!){
        wbAddAllExistingTables(schemaName: $schemaName)
      }
    """
    And def variables = { schemaName: '#(schemaName)'}
    And request { query: '#(query)', variables: '#(variables)' }
    When method POST
    Then status 200
    Then print response
    Then match response.errors == '#notpresent'
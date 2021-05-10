Feature:

  Background:
    * def wb = call read('classpath:init.feature')
    * url wb.baseUrl
    * path wb.endpointPath

    Scenario: Track all existing tables
    Given text query = 
    """
      mutation ($schemaName: String!){
        wbTrackAllTables(schemaName: $schemaName)
      }
    """
    And def variables = { schemaName: '#(schemaName)'}
    And request { query: '#(query)', variables: '#(variables)' }
    When method POST
    Then status 200
    Then print response
    Then match response.errors == '#notpresent'
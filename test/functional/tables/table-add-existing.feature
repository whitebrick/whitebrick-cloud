Feature:

  Background:
    * url baseUrl
    * path endpointPath
    * configure readTimeout = 1200000

  Scenario: Add all existing tables
    Given text query = 
    """
      mutation ($schemaName: String!){
        wbAddAllExistingTables(schemaName: $schemaName)
      }
    """
    And def variables = { schemaName: "#(schemaName)"}
    And request { query: "#(query)", variables: "#(variables)" }
    And header X-Test-User-Email = currentUserEmail
    When method POST
    Then status 200
    Then print response
    
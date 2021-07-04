Feature:

  Background:
    * url baseUrl
    * path endpointPath
    * configure readTimeout = 600000

  Scenario: Add all existing relationships
    Given text query = 
    """
      mutation ($schemaName: String!){
        wbAddAllExistingRelationships(schemaName: $schemaName)
      }
    """
    And def variables = { schemaName: "#(schemaName)"}
    And request { query: "#(query)", variables: "#(variables)" }
    When method POST
    Then status 200
    Then print response
    Then match response.errors == "#notpresent"
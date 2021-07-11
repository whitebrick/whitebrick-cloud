Feature:

  Background:
    * url baseUrl
    * path endpointPath
    
  Scenario: Delete an Organization
    Given text query = 
    """
      mutation ($name: String!){
        wbDeleteOrganization(name: $name)
      }
    """
    And def variables = { name: "#(name)"}
    And header X-Test-User-Email = currentUserEmail
    And request { query: "#(query)", variables: "#(variables)" }
    When method POST
    Then status 200

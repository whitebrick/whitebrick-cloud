Feature:

  Background:
    * url baseUrl
    * path endpointPath
    
  Scenario: Create an Organization
    Given text query = 
    """
      mutation ($name: String!, $label: String!){
        wbCreateOrganization(name: $name, label: $label){
          id
        }
      }
    """
    And def variables = { name: "#(name)", label: "#(label)" }
    And header X-Test-User-Email = currentUserEmail
    And request { query: "#(query)", variables: "#(variables)" }
    When method POST
    Then status 200

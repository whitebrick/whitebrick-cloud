Feature:

  Background:
    * url baseUrl
    * path endpointPath
  Scenario: Create an Organization
    Given text query = 
    """
      mutation ($name: String!, $label: String!, $currentUserEmail: String!){
        wbCreateOrganization(name: $name, label: $label, currentUserEmail: $currentUserEmail)
      }
    """
    And def variables = { name: '#(name)', label: '#(label)', currentUserEmail: '#(currentUserEmail)' }
    And request { query: '#(query)', variables: '#(variables)' }
    When method POST
    Then status 200
    Then match response.errors == '#notpresent'

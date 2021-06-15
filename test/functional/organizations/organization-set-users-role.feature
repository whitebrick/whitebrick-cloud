Feature:

  Background:
    * url baseUrl
    * path endpointPath

  Scenario: Add a user to a organization
    Given text query = 
    """
      mutation ($organizationName: String!, $organizationRole: String!, $userEmails: [String]!){
        wbAddUserToOrganization(organizationName: $organizationName, organizationRole: $organizationRole, userEmails: $userEmails)
      }
    """
    # Given def query = read('test.gql')
    And def variables = { organizationName: '#(organizationName)', organizationRole: '#(organizationRole)', userEmails: '#(userEmails)' }
    And request { query: '#(query)', variables: '#(variables)' }
    When method POST
    Then status 200
    Then match response.errors == '#notpresent'

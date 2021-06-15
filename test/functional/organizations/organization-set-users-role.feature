Feature:

  Background:
    * url baseUrl
    * path endpointPath

  Scenario: Add a user to a organization
    Given text query = 
    """
      mutation ($organizationName: String!, $userEmails: [String]!, $role: String!){
        wbSetOrganizationUsersRole(organizationName: $organizationName, userEmails: $userEmails, role: $role)
      }
    """
    # Given def query = read('test.gql')
    And def variables = { organizationName: '#(organizationName)', role: '#(role)', userEmails: '#(userEmails)' }
    And request { query: '#(query)', variables: '#(variables)' }
    When method POST
    Then status 200
    Then match response.errors == '#notpresent'

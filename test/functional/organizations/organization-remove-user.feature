Feature:

  Background:
    * url baseUrl
    * path endpointPath

  Scenario: Remove a user from an organization
    Given text query = 
    """
      mutation ($userEmails: [String]!, $organizationName: String!){
        wbRemoveUsersFromOrganization(userEmails: $userEmails, organizationName: $organizationName)
      }
    """
    # Given def query = read('test.gql')
    And def variables = { userEmails: '#(userEmails)', organizationName: '#(organizationName)'}
    And request { query: '#(query)', variables: '#(variables)' }
    When method POST
    Then status 200
    Then match response.errors == '#notpresent'

Feature:

  Background:
    * url baseUrl
    * path endpointPath

  Scenario: Set organization role
    Given text query = 
    """
      mutation ($organizationName: String!, $userEmails: [String]!, $roleName: String!){
        wbSetOrganizationUsersRole(organizationName: $organizationName, userEmails: $userEmails, roleName: $roleName)
      }
    """
    # Given def query = read("test.gql")
    And def variables = { organizationName: "#(organizationName)", roleName: "#(roleName)", userEmails: "#(userEmails)" }
    And header X-Test-User-Email = currentUserEmail
    And request { query: "#(query)", variables: "#(variables)" }
    When method POST
    Then status 200

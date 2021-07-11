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
    # Given def query = read("test.gql")
    And def variables = { userEmails: "#(userEmails)", organizationName: "#(organizationName)"}
    And header X-Test-User-Email = currentUserEmail
    And request { query: "#(query)", variables: "#(variables)" }
    When method POST
    Then status 200

Feature:

  Background:
    * url baseUrl
    * path endpointPath

  Scenario: Set schema role
    Given text query = 
    """
      mutation ($schemaName: String!, $userEmails: [String]!, $roleName: String!){
        wbSetSchemaUsersRole(schemaName: $schemaName, userEmails: $userEmails, roleName: $roleName)
      }
    """
    # Given def query = read("test.gql")
    And def variables = { schemaName: "#(schemaName)", userEmails: "#(userEmails)", roleName: "#(roleName)" }
    And header X-Test-User-Email = currentUserEmail
    And request { query: "#(query)", variables: "#(variables)" }
    And header X-Test-User-Email = currentUserEmail
    When method POST
    Then status 200

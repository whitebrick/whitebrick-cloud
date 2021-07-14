Feature:

  Background:
    * url baseUrl
    * path endpointPath

  Scenario: Set table role
    Given text query = 
    """
      mutation ($schemaName: String!, $tableName: String!, $userEmails: [String]!, $roleName: String!){
        wbSetTableUsersRole(schemaName: $schemaName, tableName: $tableName, userEmails: $userEmails, roleName: $roleName)
      }
    """
    # Given def query = read("test.gql")
    And def variables = { schemaName: "#(schemaName)", tableName: "#(tableName)", userEmails: "#(userEmails)", roleName: "#(roleName)" }
    And header X-Test-User-Email = currentUserEmail
    And request { query: "#(query)", variables: "#(variables)" }
    When method POST
    Then status 200


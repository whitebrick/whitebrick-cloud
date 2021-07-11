Feature:

  Background:
    * url baseUrl
    * path endpointPath

  
  Scenario: Add a user to a schema
    Given text query = 
    """
      mutation ($schemaName: String!, $userEmails: [String]!, $roleName: String!){
        wbSetSchemaUsersRole(schemaName: $schemaName, userEmails: $userEmails, roleName: $roleName)
      }
    """
    # Given def query = read("test.gql")
    And def variables = { schemaName: "#(schemaName)", userEmails: "#(userEmails)", roleName: "#(roleName)" }
    And header X-Test-User-Email = "test_donna@test.whitebrick.com"
    And request { query: "#(query)", variables: "#(variables)" }
    When method POST
    Then status 200
    Then match response.errors == "#notpresent"

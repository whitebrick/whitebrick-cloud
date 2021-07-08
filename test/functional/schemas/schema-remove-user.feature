Feature:

  Background:
    * url baseUrl
    * path endpointPath

  Scenario: Remove a user from a schema
    Given text query = 
    """
      mutation ($schemaName: String!, $userEmails: [String]!){
        wbRemoveSchemaUsers(schemaName: $schemaName, userEmails: $userEmails)
      }
    """
    # Given def query = read("test.gql")
    And def variables = { schemaName: "#(schemaName)", userEmails: "#(userEmails)"}
    And header X-Test-User-Email = "test_donna@test.whitebrick.com"
    And request { query: "#(query)", variables: "#(variables)" }
    When method POST
    Then status 200
    Then match response.errors == "#notpresent"

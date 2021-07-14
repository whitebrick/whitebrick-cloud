Feature:

  Background:
    * url baseUrl
    * path endpointPath

  Scenario: Remove users from a schema
    Given text query = 
    """
      mutation ($schemaName: String!, $userEmails: [String]!){
        wbRemoveSchemaUsers(schemaName: $schemaName, userEmails: $userEmails)
      }
    """
    # Given def query = read("test.gql")
    And def variables = { schemaName: "#(schemaName)", userEmails: "#(userEmails)"}
    And header X-Test-User-Email = currentUserEmail
    And request { query: "#(query)", variables: "#(variables)" }
    When method POST
    Then status 200
    

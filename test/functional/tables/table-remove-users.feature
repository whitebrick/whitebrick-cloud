Feature:

  Background:
    * url baseUrl
    * path endpointPath

  Scenario: Remove users from a table
    Given text query = 
    """
      mutation ($schemaName: String!,$tableName: String!, $userEmails: [String]!){
        wbRemoveTableUsers(schemaName: $schemaName, tableName: $tableName, userEmails: $userEmails)
      }
    """
    # Given def query = read("test.gql")
    And def variables = { schemaName: "#(schemaName)", tableName: "#(tableName)", userEmails: "#(userEmails)"}
    And header X-Test-User-Email = currentUserEmail
    And request { query: "#(query)", variables: "#(variables)" }
    When method POST
    Then status 200
    

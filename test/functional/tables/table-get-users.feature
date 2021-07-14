Feature:

  Background:
    * url baseUrl
    * path endpointPath

  Scenario: Get table users
    Given text query = 
    """
      query ($schemaName: String!, $tableName: String!, $userEmails: [String]){
        wbTableUsers(schemaName: $schemaName, tableName: $tableName, userEmails: $userEmails){
          userEmail
          role{
            name
            impliedFrom
          }
        }
      }
    """
    # Given def query = read("test.gql")
    And def variables = { schemaName: "#(schemaName)", tableName: "#(tableName)", userEmails: "#(userEmails)" }
    And header X-Test-User-Email = currentUserEmail
    And request { query: "#(query)", variables: "#(variables)" }
    When method POST
    Then status 200
    

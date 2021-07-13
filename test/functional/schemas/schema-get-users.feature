Feature:

  Background:
    * url baseUrl
    * path endpointPath

  Scenario: Get schema users
    Given text query = 
    """
      query ($schemaName: String!, $userEmails: [String]){
        wbSchemaUsers(schemaName: $schemaName, userEmails: $userEmails){
          userEmail
          role{
            name
            impliedFrom
          }
        }
      }
    """
    # Given def query = read("test.gql")
    And def variables = { schemaName: "#(schemaName)", userEmails: "#(userEmails)" }
    And header X-Test-User-Email = currentUserEmail
    And request { query: "#(query)", variables: "#(variables)" }
    When method POST
    Then status 200
    

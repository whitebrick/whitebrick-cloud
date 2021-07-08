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
          role
          roleImpliedFrom
        }
      }
    """
    # Given def query = read("test.gql")
    And def variables = { schemaName: "#(schemaName)", userEmails: "#(userEmails)" }
    And header X-Test-User-Email = "test_donna@test.whitebrick.com"
    And request { query: "#(query)", variables: "#(variables)" }
    When method POST
    Then status 200
    Then match response.errors == "#notpresent"

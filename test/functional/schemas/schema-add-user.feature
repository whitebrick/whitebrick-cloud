Feature: Add a user to a schema

  Background:
    * def wb = call read('classpath:init.feature')
    * url wb.baseUrl
    * path wb.endpointPath

  
  Scenario: Add a user to a schema
    Given text query = 
    """
      mutation ($schemaName: String!, $userEmail: String!, $schemaRole: String!){
        wbAddUserToSchema(schemaName: $schemaName, userEmail: $userEmail, schemaRole: $schemaRole) {
          id
          email
        }
      }
    """
    # Given def query = read('test.gql')
    And def variables = { schemaName: '#(schemaName)', userEmail: '#(userEmail)', schemaRole: '#(schemaRole)' }
    And request { query: '#(query)', variables: '#(variables)' }
    When method POST
    Then status 200
    Then match response.errors == '#notpresent'

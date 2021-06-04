Feature:

  Background:
    * url baseUrl
    * path endpointPath
  Scenario: Create a user
    Given text query = 
    """
      mutation ($email: String!, $firstName: String!, $lastName: String!){
        wbCreateUser(email: $email, firstName: $firstName, lastName: $lastName) {
          email
          firstName
          lastName
        }
      }
    """
    And def variables = { email: '#(email)', firstName: '#(firstName)', lastName: '#(lastName)' }
    And request { query: '#(query)', variables: '#(variables)' }
    When method POST
    Then status 200
    Then match response.errors == '#notpresent'

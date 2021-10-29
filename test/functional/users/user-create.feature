Feature:

  Background:
    * url baseUrl
    * path endpointPath
    
  Scenario: Create a user
    Given text query = 
    """
      mutation ($authId: String, $email: String, $firstName: String, $lastName: String){
        wbCreateUser(authId: $authId, email: $email, firstName: $firstName, lastName: $lastName) {
          email
          firstName
          lastName
        }
      }
    """
    And def variables = { email: "#(email)", firstName: "#(firstName)", lastName: "#(lastName)" }
    And request { query: "#(query)", variables: "#(variables)" }
    And header X-Test-User-Email = "sys_admin@example.com"
    When method POST
    Then status 200

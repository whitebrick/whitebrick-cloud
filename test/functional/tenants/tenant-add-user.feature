Feature: Add a user to a tenant

  Background:
    * url baseUrl
    * path endpointPath

  
  Scenario: Add a user to a tenant
    Given text query = 
    """
      mutation ($tenantName: String!, $userEmail: String!, $tenantRole: String!){
        wbAddUserToTenant(tenantName: $tenantName, userEmail: $userEmail, tenantRole: $tenantRole) {
          id
          email
        }
      }
    """
    # Given def query = read('test.gql')
    And def variables = { tenantName: '#(tenantName)', userEmail: '#(userEmail)', tenantRole: '#(tenantRole)' }
    And request { query: '#(query)', variables: '#(variables)' }
    When method POST
    Then status 200
    Then match response.errors == '#notpresent'

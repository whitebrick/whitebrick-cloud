Feature:

  Background:
    * def wb = call read('classpath:init.feature')
    * url wb.baseUrl
    * path wb.endpointPath

  Scenario: Create a schema
    Given text query = 
    """
      mutation ($name: String!, $label: String!, $tenantOwnerName: String, $userOwnerEmail: String){
        wbCreateSchema(name: $name, label: $label, tenantOwnerName: $tenantOwnerName, userOwnerEmail: $userOwnerEmail) {
          name,
          label
        }
      }
    """
    And def variables = { name: '#(name)', label: '#(label)', tenantOwnerName: '#(tenantOwnerName)', userOwnerEmail: '#(userOwnerEmail)'}
    And request { query: '#(query)', variables: '#(variables)' }
    When method POST
    Then status 200
    Then print response
    Then match response.errors == '#notpresent'
Feature:

  Background:
    * url baseUrl
    * path endpointPath
    # Could not get ##(<var>) working, below is work around for an empty tenant/user owner https://github.com/intuit/karate/issues/145
    * def tenantOwnerNameChk = typeof tenantOwnerName == 'undefined' ? null : tenantOwnerName
    * def userOwnerEmailChk = typeof userOwnerEmail == 'undefined' ? null : userOwnerEmail
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
    And def variables = { name: '#(name)', label: '#(label)', tenantOwnerName: '##(tenantOwnerNameChk)', userOwnerEmail: '##(userOwnerEmailChk)'}
    And request { query: '#(query)', variables: '#(variables)' }
    When method POST
    Then status 200
    Then print response
    Then match response.errors == '#notpresent'
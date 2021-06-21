Feature:

  Background:
    * url baseUrl
    * path endpointPath
    # Could not get ##(<var>) working, below is work around for an empty organization/user owner https://github.com/intuit/karate/issues/145
    * def organizationOwnerNameChk = typeof organizationOwnerName == 'undefined' ? null : organizationOwnerName
    * def userOwnerEmailChk = typeof userOwnerEmail == 'undefined' ? null : userOwnerEmail
  Scenario: Create a schema
    Given text query = 
    """
      mutation ($currentUserEmail: String!, $name: String!, $label: String!, $organizationOwnerName: String, $userOwnerEmail: String){
        wbCreateSchema(currentUserEmail: $currentUserEmail, name: $name, label: $label, organizationOwnerName: $organizationOwnerName, userOwnerEmail: $userOwnerEmail) {
          name,
          label
        }
      }
    """
    And def variables = { currentUserEmail: '#(currentUserEmail)', name: '#(name)', label: '#(label)', organizationOwnerName: '##(organizationOwnerNameChk)', userOwnerEmail: '##(userOwnerEmailChk)'}
    # And header X-Test-User-ID = uid
    And header X-Hasura-Role = 'admin'
    And request { query: '#(query)', variables: '#(variables)'} }
    When method POST
    Then status 200
    Then print response
    Then match response.errors == '#notpresent'
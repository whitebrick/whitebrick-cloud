Feature:

  Background:
    * url baseUrl
    * path endpointPath
    # Could not get ##(<var>) working, below is work around for an empty organization/user owner https://github.com/intuit/karate/issues/145
    * def organizationOwnerNameChk = typeof organizationOwnerName == "undefined" ? null : organizationOwnerName
  Scenario: Create a schema
    Given text query = 
    """
      mutation ($name: String!, $label: String!, $organizationOwnerName: String){
        wbAddOrCreateSchema(name: $name, label: $label, organizationOwnerName: $organizationOwnerName, create: true) {
          name,
          label
        }
      }
    """
    And def variables = {name: "#(name)", label: "#(label)", organizationOwnerName: "##(organizationOwnerNameChk)"}
    And header X-Test-User-Email = currentUserEmail
    And request { query: "#(query)", variables: "#(variables)"} }
    When method POST
    Then status 200
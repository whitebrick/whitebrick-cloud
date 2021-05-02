Feature: Create a tenant

  Background:
    * def wb = call read('classpath:init.feature')
    * url wb.baseUrl
    * path wb.endpointPath
    * print "*** background name=", name
    * print "*** background label=", label

  Scenario: Create a tenant
    Given text query = 
    """
      mutation ($name: String!, $label: String!){
        wbCreateTenant(name: $name, label: $label) {
          id
          name
          label
        }
      }
    """
    # Given def query = read('test.gql')
    And def variables = { name: '#(name)', label: '#(label)' }
    And request { query: '#(query)', variables: '#(variables)' }
    When method POST
    Then status 200
    Then match response == "#object"
    Then match response.errors == '#notpresent'

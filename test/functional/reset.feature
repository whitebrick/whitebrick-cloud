Feature:

  Background:
    * def wb = call read('classpath:init.feature')
    * url wb.baseUrl
    * path wb.endpointPath

  Scenario: Reset test data
    Given text query = 
    """
    mutation MyMutation {
      wbResetTestData
    }
    """
    And request { query: '#(query)' }
    When method POST
    Then status 200
    Then print response.data
    Then match response.data.wbResetTestData == true
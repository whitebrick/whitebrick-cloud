Feature:

  Background:
    * url baseUrl
    * path endpointPath
    * configure readTimeout = 600000
    
  Scenario: Reset test data
    Given text query = 
    """
    mutation reset {
      wbResetTestData
    }
    """
    And header X-Test-User-Email = "test_donna@test.whitebrick.com"
    And request { query: "#(query)" }
    When method POST
    Then status 200
    Then print response.data
    Then match response.data.wbResetTestData == true
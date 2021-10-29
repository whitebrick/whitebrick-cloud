Feature:

  Background:
    * url baseUrl
    * path endpointPath
    * configure readTimeout = 1200000
    
  Scenario: Reset test data
    Given text query = 
    """
    mutation resetTestData {
      wbUtil(
        fn: "resetTestData"
      )
    }
    """
    And request { query: "#(query)" }
    And header X-Test-User-Email = "test_donna@test.whitebrick.com"
    When method POST
    Then status 200
    Then print response.data
    Then match response.data.wbUtil.success == true
function (user, context, callback) {
  const namespace = "https://hasura.io/jwt/claims";
  const userAuthId = user.user_id;
  const adminSecret = "MYSECRET";
  const url = "https://graph.example.com/v1/graphql";
  const query = `
    mutation($userAuthId: String!, $userObj: JSON!) {
      wbAuth(
        userAuthId: $userAuthId,
        userObj: $userObj
      )
    }
  `;
  const variables = {
    "userAuthId": userAuthId,
    "userObj": user
  };
  request.post(
    {
      url: url,
      headers: {'content-type' : 'application/json', 'x-hasura-admin-secret': adminSecret},
      body: JSON.stringify({
        query: query,
        variables: variables
      })
    }, function(error, response, body){
      //console.log("**RETURN ERROR: "+JSON.stringify(error));
      //console.log("**RETURN RESPONSE: "+JSON.stringify(response));
      //console.log("**RETURN BODY: "+JSON.stringify(body));
      const errMsg = "User could not be retrieved from Server.";
      if(body){
        try {
          const bodyObj = JSON.parse(body);
          if(bodyObj && bodyObj.data && bodyObj.data.wbAuth){
            context.idToken[namespace] = JSON.parse(body).data.wbAuth;
            return callback(null, user, context);
          }
        } catch(e) {
          return callback(new UnauthorizedError(errMsg));
        }
      }
      return callback(new UnauthorizedError(errMsg));
    }
  );
}
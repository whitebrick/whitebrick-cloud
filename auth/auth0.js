function (user, context, callback) {
  const namespace = "https://hasura.io/jwt/claims";
  const userAuthId = user.user_id;
  const adminSecret = "Ha5uraWBStaging";
  const url = "https://graph-staging.whitebrick.com/v1/graphql";
  const query = `
    mutation($userAuthId: String!) {
      wbAuth(
        userAuthId: $userAuthId
      )
    }
  `;
  const variables = { "userAuthId": userAuthId };
  request.post(
    {
      url: url,
      headers: {'content-type' : 'application/json', 'x-hasura-admin-secret': adminSecret},
      body: JSON.stringify({
        query: query,
        variables: variables
      })
    }, function(error, response, body){
        console.log(body);
        context.idToken[namespace] = JSON.parse(body).data.wbAuth;
        callback(null, user, context);
    }
  );
}